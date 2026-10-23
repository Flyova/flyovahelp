import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { resolvePrivilegedRole } from "@/lib/adminAccess";
import { containsMediaMarker, ownedUsername } from "@/lib/chat";

// POST /api/chat/room — the public chatroom everyone can read (Firestore rules: read-only
// for signed-in players). Posting goes through here so the server can rate-limit and
// refuse banned/muted players; clients cannot write chatroom messages directly.
//
//   { action: "send", as, text }  -> { id }
//   { action: "delete", id }      -> { ok }   own message, or any message for admin/staff/support

const ROOM_COLLECTION = "chatroom_messages";
const RATE_COLLECTION = "chatroom_rate"; // per-account { lastPostAt, lastText } — server only
const MAX_LENGTH = 500;
const MIN_INTERVAL_MS = 3000;
const DELETED_TEXT = "— message deleted —";

const fail = (error, status = 400) => NextResponse.json({ error }, { status });

async function send(db, caller, { as, text }) {
  const me = await ownedUsername(db, caller.uid, as);
  if (!me) return fail("You can only post as one of your own usernames.", 403);

  const body = String(text || "").trim();
  if (!body) return fail("Write a message first.");
  if (body.length > MAX_LENGTH) return fail(`Chatroom messages are limited to ${MAX_LENGTH} characters.`);
  if (containsMediaMarker(body)) return fail("Text only — no images, voice or video.");

  const userSnap = await db.collection("users").doc(caller.uid).get();
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
    });
    return null;
  });
  if (refused) return fail(refused.error, refused.status);
  return NextResponse.json({ id: msgRef.id });
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

export async function POST(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const body = await req.json().catch(() => ({}));
    const db = getAdminDb();
    if (body.action === "send") return await send(db, caller, body);
    if (body.action === "delete") return await remove(db, caller, body);
    return fail("Unknown action.");
  } catch (e) {
    console.error("Chatroom error:", e);
    return fail(e?.message || "Something went wrong.", 500);
  }
}
