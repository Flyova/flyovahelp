import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { resolvePrivilegedRole } from "@/lib/adminAccess";
import { PRESENCE_ONLINE_MS, containsMediaMarker, mentionsIn, ownedUsername, usernameUids } from "@/lib/chat";
import { sendPushToUsers } from "@/lib/push";
import { chatSettingsFor } from "@/lib/chatSettings";

// POST /api/chat/room — the public chatroom everyone can read (Firestore rules: read-only
// for signed-in players). Posting goes through here so the server can rate-limit and
// refuse banned/muted players; clients cannot write chatroom messages directly.
//
//   { action: "send", as, text, replyTo? } -> { id }   replyTo = id of a chatroom message
//   { action: "edit", id, text }           -> { ok }   own message only
//   { action: "delete", id }               -> { ok }   own message, or any message for admin/staff/support
//
// GET /api/chat/room -> { members, online }: every chat username, and how many were
// active in Chats in the last few minutes (counted, never listed).
// GET /api/chat/room?search=words -> { results, scanned, since }   admin/staff/support: the
//   messages among the latest SEARCH_SCAN that contain every word (case-insensitive, in the
//   text or the sender's name), newest first; `since` = when the oldest scanned one was sent.

const ROOM_COLLECTION = "chatroom_messages";
const RATE_COLLECTION = "chatroom_rate"; // per-account { lastPostAt, lastText } — server only
const MAX_LENGTH = 500;
const MIN_INTERVAL_MS = 3000;
const DELETED_TEXT = "— message deleted —";
const QUOTE_LENGTH = 140;
const SEARCH_SCAN = 3000; // Firestore can't search text: an admin search reads this many of the latest messages
const SEARCH_RESULTS = 200;

/** Validates chatroom text; returns { body } or { error }. */
function cleanText(text) {
  const body = String(text || "").trim();
  if (!body) return { error: "Write a message first." };
  if (body.length > MAX_LENGTH) return { error: `Chatroom messages are limited to ${MAX_LENGTH} characters.` };
  if (containsMediaMarker(body)) return { error: "Text only — no images, voice or video." };
  return { body };
}

const fail = (error, status = 400) => NextResponse.json({ error }, { status });

/**
 * Players @mentioned in a Chatroom message get a notification and a push (unless
 * they've blocked the sender), in the sound they picked for the Chatroom. At most
 * a few per message.
 */
async function notifyMentions(db, me, body, messageId) {
  const names = mentionsIn(body).filter((n) => n !== me.lower);
  if (!names.length) return;
  const [nameSnaps, blockSnaps] = await Promise.all([
    db.getAll(...names.map((n) => db.collection("usernames").doc(n))),
    db.getAll(...names.map((n) => db.collection("chat_blocks").doc(`${n}_${me.lower}`))),
  ]);
  const title = `@${me.lower} mentioned you in the Chatroom`;
  const preview = body.slice(0, 120);
  const live = names.filter((n, i) => nameSnaps[i].exists && !nameSnaps[i].data().deleted);
  const settings = await chatSettingsFor(db, live.map((n) => ({ name: n, uid: nameSnaps[names.indexOf(n)].data().uid }))).catch(() => new Map());
  const targets = [];
  const writes = [];
  names.forEach((n, i) => {
    const s = nameSnaps[i];
    if (!s.exists || s.data().deleted || blockSnaps[i].exists) return;
    writes.push(db.collection("notifications").add({
      toUsername: n, fromUsername: me.lower, kind: "mention", title, body: preview, room: "public", messageId,
      read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => null));
    const tone = settings.get(n)?.sounds.tones.room;
    for (const uid of usernameUids(s.data())) targets.push({ uid, tone, data: { url: "/chat/room" } });
  });
  await Promise.all([...writes, sendPushToUsers(targets, { title, body: preview, data: { kind: "mention", room: "public" } }).catch(() => 0)]);
}

async function send(db, caller, { as, text, replyTo }) {
  const { body, error } = cleanText(text);
  if (error) return fail(error);

  // Independent reads at once: who you're posting as, your account, and the message you reply to.
  const [me, userSnap, original] = await Promise.all([
    ownedUsername(db, caller.uid, as),
    db.collection("users").doc(caller.uid).get(),
    replyTo ? db.collection(ROOM_COLLECTION).doc(String(replyTo)).get() : null,
  ]);
  if (!me) return fail("You can only post as one of your own usernames.", 403);

  // A reply carries a short quote of the original so it renders without a second read.
  let quote = null;
  if (original) {
    if (!original.exists || original.data().deletedForEveryone) return fail("That message is no longer available to reply to.", 404);
    const o = original.data();
    quote = { id: original.id, sender: o.sender, text: String(o.text || "").slice(0, QUOTE_LENGTH) };
  }

  const user = userSnap.exists ? userSnap.data() : {};
  if (user.isban || user.banned) return fail("Your account can't post in the chatroom.", 403);
  if (user.chatMuted) return fail("You've been muted in the chatroom.", 403);

  const now = Date.now();
  const rateRef = db.collection(RATE_COLLECTION).doc(caller.uid);
  const msgRef = db.collection(ROOM_COLLECTION).doc();

  const refused = await db.runTransaction(async (tx) => {
    const rate = (await tx.get(rateRef)).data() || {};
    const wait = Number(rate.lastPostAt || 0) + MIN_INTERVAL_MS - now;
    if (wait > 0) return { error: `Slow down — you can post again in ${Math.ceil(wait / 1000)}s.`, status: 429 };
    if (rate.lastText && rate.lastText === body.toLowerCase()) {
      return { error: "You just sent that message.", status: 429 };
    }
    tx.set(rateRef, { lastPostAt: now, lastText: body.toLowerCase() });
    tx.create(msgRef, {
      sender: me.lower,
      senderName: me.username || me.lower,
      senderUid: caller.uid,
      text: body,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtMs: now,
      deletedForEveryone: false,
      ...(quote ? { replyTo: quote } : {}),
    });
    return null;
  });
  if (refused) return fail(refused.error, refused.status);
  await notifyMentions(db, me, body, msgRef.id).catch((e) => console.error("Mention notify error:", e));
  return NextResponse.json({ id: msgRef.id });
}

async function edit(db, caller, { id, text }) {
  const { body, error } = cleanText(text);
  if (error) return fail(error);
  const ref = db.collection(ROOM_COLLECTION).doc(String(id || ""));
  const [snap, userSnap] = await Promise.all([ref.get(), db.collection("users").doc(caller.uid).get()]);
  if (!snap.exists) return fail("Message not found.", 404);
  if (snap.data().senderUid !== caller.uid) return fail("You can only edit your own messages.", 403);
  if (userSnap.data()?.chatMuted) return fail("You've been muted in the chatroom, so you can't edit messages.", 403);
  if (snap.data().deletedForEveryone) return fail("Deleted messages can't be edited.", 400);
  if (snap.data().kind === "coins") return fail("Coin messages can't be edited.", 400);
  if (String(snap.data().text || "") === body) return NextResponse.json({ ok: true }); // unchanged: not "edited"
  await ref.update({ text: body, editedAt: admin.firestore.FieldValue.serverTimestamp() });
  return NextResponse.json({ ok: true });
}

async function remove(db, caller, { id }) {
  const ref = db.collection(ROOM_COLLECTION).doc(String(id || ""));
  const snap = await ref.get();
  if (!snap.exists) return fail("Message not found.", 404);

  if (snap.data().senderUid !== caller.uid) {
    const userSnap = await db.collection("users").doc(caller.uid).get();
    const role = resolvePrivilegedRole(userSnap.exists ? userSnap.data().role : null, caller.email);
    if (!role) return fail("You can only delete your own messages.", 403);
  }

  await ref.update({ text: DELETED_TEXT, deletedForEveryone: true, deletedBy: caller.uid });
  return NextResponse.json({ ok: true });
}

async function searchRoom(db, caller, search) {
  const userSnap = await db.collection("users").doc(caller.uid).get();
  if (!resolvePrivilegedRole(userSnap.exists ? userSnap.data().role : null, caller.email)) return fail("Admins only.", 403);
  const words = String(search).toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length || words.join(" ").length < 2) return fail("Type at least 2 letters to search.");
  const snap = await db.collection(ROOM_COLLECTION).orderBy("createdAt", "desc").limit(SEARCH_SCAN)
    .select("sender", "senderName", "senderUid", "text", "createdAt", "deletedForEveryone", "kind", "replyTo", "editedAt").get();
  const results = [];
  for (const d of snap.docs) {
    const m = d.data();
    if (m.deletedForEveryone) continue;
    const hay = `${m.text || ""} @${m.sender || ""} @${m.senderName || ""}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) continue;
    results.push({ id: d.id, ...m, createdAt: m.createdAt?.toMillis?.() ?? null, editedAt: m.editedAt?.toMillis?.() ?? null });
    if (results.length >= SEARCH_RESULTS) break;
  }
  const oldest = snap.docs[snap.docs.length - 1]?.data().createdAt?.toMillis?.() ?? null;
  return NextResponse.json({ results, scanned: snap.size, since: oldest, complete: snap.size < SEARCH_SCAN });
}

export async function GET(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const db = getAdminDb();
    const search = new URL(req.url).searchParams.get("search");
    if (search !== null) return await searchRoom(db, caller, search);
    const since = admin.firestore.Timestamp.fromMillis(Date.now() - PRESENCE_ONLINE_MS);
    const [members, online] = await Promise.all([
      db.collection("usernames").where("deleted", "==", false).count().get(),
      db.collection("chat_presence").where("lastActive", ">", since).count().get(),
    ]);
    return NextResponse.json({ members: members.data().count, online: online.data().count });
  } catch (e) {
    return fail(e?.message || "Something went wrong.", 500);
  }
}

export async function POST(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const body = await req.json().catch(() => ({}));
    const db = getAdminDb();
    if (body.action === "send") return await send(db, caller, body);
    if (body.action === "edit") return await edit(db, caller, body);
    if (body.action === "delete") return await remove(db, caller, body);
    return fail("Unknown action.");
  } catch (e) {
    console.error("Chatroom error:", e);
    return fail(e?.message || "Something went wrong.", 500);
  }
}
