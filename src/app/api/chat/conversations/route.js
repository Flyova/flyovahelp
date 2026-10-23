import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { dmIdFor, isValidUsername, norm, ownedUsername } from "@/lib/chat";

// POST /api/chat/conversations — the only way conversations are created or joined.
// Firestore rules forbid clients from creating conversations or changing their
// members, so every conversation carries a trustworthy `participantUids` list
// (what the rules use to decide who may read and post).
//
//   { action: "dm", as, target }               -> { id }  open/create a private chat
//   { action: "group", as, name }              -> { id }  create a group (caller is admin)
//   { action: "addMember", convoId, as, username } -> { ok } add someone to a group (admins only)

const MAX_GROUP_MEMBERS = 100;
const FV = () => admin.firestore.FieldValue;
const fail = (error, status = 400) => NextResponse.json({ error }, { status });

async function activeUsername(db, username) {
  const lower = norm(String(username || "").trim().replace(/^@/, ""));
  if (!isValidUsername(lower)) return null;
  const snap = await db.collection("usernames").doc(lower).get();
  if (!snap.exists || snap.data().deleted) return null;
  return { lower, uid: snap.data().uid };
}

async function openDm(db, caller, { as, target }) {
  const me = await ownedUsername(db, caller.uid, as);
  if (!me) return fail("You can only chat as one of your own usernames.", 403);
  const other = await activeUsername(db, target);
  if (!other) return fail("That username doesn't exist.", 404);
  if (other.lower === me.lower) return fail("You can't message yourself.");

  const blocked = await db.collection("chat_blocks").doc(`${other.lower}_${me.lower}`).get();
  if (blocked.exists) return fail("You are blocked by this user.", 403);

  const id = dmIdFor(me.lower, other.lower);
  const ref = db.collection("conversations").doc(id);
  const participantUids = [...new Set([caller.uid, other.uid])];
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      type: "dm",
      participants: [me.lower, other.lower],
      participantUids,
      createdBy: me.lower,
      createdAt: FV().serverTimestamp(),
      lastMessage: "",
      lastMessageAt: FV().serverTimestamp(),
    });
  } else if (!Array.isArray(snap.data().participantUids)) {
    // Conversation from before participantUids existed.
    await ref.update({ participantUids });
  }
  return NextResponse.json({ id });
}

async function createGroup(db, caller, { as, name }) {
  const me = await ownedUsername(db, caller.uid, as);
  if (!me) return fail("You can only chat as one of your own usernames.", 403);
  const groupName = String(name || "").trim().slice(0, 60);
  if (!groupName) return fail("Group name required.");

  const ref = db.collection("conversations").doc();
  await ref.set({
    type: "group",
    groupName,
    participants: [me.lower],
    participantUids: [caller.uid],
    admins: [me.lower],
    createdBy: me.lower,
    createdAt: FV().serverTimestamp(),
    lastMessage: "",
    lastMessageAt: FV().serverTimestamp(),
  });
  return NextResponse.json({ id: ref.id });
}

async function addMember(db, caller, { convoId, as, username }) {
  const me = await ownedUsername(db, caller.uid, as);
  if (!me) return fail("You can only act as one of your own usernames.", 403);
  const other = await activeUsername(db, username);
  if (!other) return fail("That username doesn't exist.", 404);

  const ref = db.collection("conversations").doc(String(convoId || ""));
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { error: "Group not found.", status: 404 };
    const convo = snap.data();
    if (convo.type !== "group") return { error: "Only groups can have members added.", status: 400 };
    if (!(convo.admins || []).includes(me.lower)) return { error: "Only group admins can add members.", status: 403 };
    const participants = convo.participants || [];
    if (participants.includes(other.lower)) return { error: `@${other.lower} is already in this group.`, status: 409 };
    if (participants.length >= MAX_GROUP_MEMBERS) return { error: `Groups are limited to ${MAX_GROUP_MEMBERS} members.`, status: 400 };

    tx.update(ref, {
      participants: FV().arrayUnion(other.lower),
      participantUids: FV().arrayUnion(other.uid),
    });
    return null;
  });
  if (result) return fail(result.error, result.status);
  return NextResponse.json({ ok: true });
}

export async function POST(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const body = await req.json().catch(() => ({}));
    const db = getAdminDb();

    switch (body.action) {
      case "dm":
        return await openDm(db, caller, body);
      case "group":
        return await createGroup(db, caller, body);
      case "addMember":
        return await addMember(db, caller, body);
      default:
        return fail("Unknown action.");
    }
  } catch (e) {
    console.error("Chat conversations error:", e);
    return fail(e?.message || "Something went wrong.", 500);
  }
}
