import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import {
  dmIdFor, isValidUsername, norm, ownedUsername,
  GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX, MAX_GROUP_MEMBERS, groupOwner, groupSearchKeys, isGroupAdmin,
} from "@/lib/chat";

// POST /api/chat/conversations — the only way conversations are created or joined.
// Firestore rules forbid clients from creating conversations or changing their
// members, so every conversation carries a trustworthy `participantUids` list
// (what the rules use to decide who may read and post).
//
//   { action: "dm", as, target }                              -> { id }  open/create a private chat
//   { action: "group", as, name, description?, visibility? }  -> { id }  create a group (caller owns it)
//   { action: "join", convoId, as }                           -> { id }  join a public group
//   { action: "leave", convoId, as }                          -> { ok }  leave a group (not the owner)
//   { action: "addMember", convoId, as, username }            -> { ok }  admins
//   { action: "removeMember", convoId, as, username }         -> { ok }  admins; only the owner removes admins
//   { action: "setAdmin", convoId, as, username, admin }      -> { ok }  owner only
//   { action: "updateGroup", convoId, as, name?, description?, visibility? } -> { ok }  admins
//   { action: "deleteGroup", convoId, as }                    -> { ok }  owner only
//   { action: "deleteMessage", convoId, as, messageId }       -> { ok }  admins remove anyone's message
//   { action: "unblock", as, target }                         -> { ok }  let a player you blocked message you again

const FV = () => admin.firestore.FieldValue;
const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const DELETED_TEXT = "— message deleted —";

async function activeUsername(db, username) {
  const lower = norm(String(username || "").trim().replace(/^@/, ""));
  if (!isValidUsername(lower)) return null;
  const snap = await db.collection("usernames").doc(lower).get();
  if (!snap.exists || snap.data().deleted) return null;
  return { lower, uid: snap.data().uid };
}

// Like activeUsername, but also finds deleted usernames (they can still sit in a group).
async function anyUsername(db, username) {
  const lower = norm(String(username || "").trim().replace(/^@/, ""));
  if (!isValidUsername(lower)) return null;
  const snap = await db.collection("usernames").doc(lower).get();
  return snap.exists ? { lower, uid: snap.data().uid } : null;
}

// Every username an account has held: an account stays in a group's participantUids
// while any of them is still a member.
async function accountUsernames(db, uid) {
  const snap = await db.collection("usernames").where("uid", "==", uid).get();
  return snap.docs.map((d) => d.id);
}

const visibilityOf = (v) => (v === "public" ? "public" : "private");
const cleanName = (name) => String(name || "").trim().replace(/\s+/g, " ").slice(0, GROUP_NAME_MAX);
const cleanDescription = (d) => String(d || "").trim().slice(0, GROUP_DESCRIPTION_MAX);

/**
 * Runs `fn(convo, tx)` on a live group inside a transaction. `fn` returns the
 * update to apply, or { error, status } to refuse.
 */
async function withGroup(db, convoId, fn) {
  const ref = db.collection("conversations").doc(String(convoId || ""));
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().deleted) return { error: "Group not found.", status: 404 };
    const convo = snap.data();
    if (convo.type !== "group") return { error: "That chat isn't a group.", status: 400 };
    const out = await fn(convo, tx);
    if (out?.error) return out;
    if (out) tx.update(ref, out);
    return null;
  });
  return result ? fail(result.error, result.status) : null;
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

async function createGroup(db, caller, { as, name, description, visibility }) {
  const me = await ownedUsername(db, caller.uid, as);
  if (!me) return fail("You can only chat as one of your own usernames.", 403);
  const groupName = cleanName(name);
  if (!groupName) return fail("Group name required.");
  const vis = visibilityOf(visibility);

  const ref = db.collection("conversations").doc();
  await ref.set({
    type: "group",
    groupName,
    description: cleanDescription(description),
    visibility: vis,
    searchKeys: vis === "public" ? groupSearchKeys(groupName) : [],
    participants: [me.lower],
    participantUids: [caller.uid],
    owner: me.lower,
    admins: [me.lower],
    removed: [],
    createdBy: me.lower,
    createdAt: FV().serverTimestamp(),
    lastMessage: "",
    lastMessageAt: FV().serverTimestamp(),
  });
  return NextResponse.json({ id: ref.id });
}

async function joinGroup(db, caller, { convoId, as }) {
  const me = await ownedUsername(db, caller.uid, as);
  if (!me) return fail("You can only chat as one of your own usernames.", 403);
  const refused = await withGroup(db, convoId, (convo) => {
    // Already in (as this or another of your usernames): nothing to do.
    if ((convo.participantUids || []).includes(caller.uid)) return null;
    if (convo.visibility !== "public") return { error: "This group is private. Ask an admin to add you.", status: 403 };
    if ((convo.removed || []).includes(me.lower)) return { error: "An admin removed you from this group.", status: 403 };
    if ((convo.participants || []).length >= MAX_GROUP_MEMBERS) return { error: `This group is full (${MAX_GROUP_MEMBERS} members).`, status: 400 };
    return { participants: FV().arrayUnion(me.lower), participantUids: FV().arrayUnion(caller.uid) };
  });
  return refused || NextResponse.json({ id: String(convoId) });
}

async function leaveGroup(db, caller, { convoId, as }) {
  const me = await ownedUsername(db, caller.uid, as);
  if (!me) return fail("You can only act as one of your own usernames.", 403);
  const mine = await accountUsernames(db, caller.uid);
  const refused = await withGroup(db, convoId, (convo) => {
    const participants = convo.participants || [];
    if (!participants.includes(me.lower)) return { error: "You're not in this group.", status: 400 };
    if (groupOwner(convo) === me.lower) return { error: "You own this group. Delete it instead of leaving.", status: 400 };
    const staying = participants.some((p) => p !== me.lower && mine.includes(p));
    return {
      participants: FV().arrayRemove(me.lower),
      admins: FV().arrayRemove(me.lower),
      ...(staying ? {} : { participantUids: FV().arrayRemove(caller.uid) }),
    };
  });
  return refused || NextResponse.json({ ok: true });
}

async function addMember(db, caller, { convoId, as, username }) {
  const me = await ownedUsername(db, caller.uid, as);
  if (!me) return fail("You can only act as one of your own usernames.", 403);
  const other = await activeUsername(db, username);
  if (!other) return fail("That username doesn't exist.", 404);

  const refused = await withGroup(db, convoId, (convo) => {
    if (!isGroupAdmin(convo, me.lower)) return { error: "Only group admins can add members.", status: 403 };
    const participants = convo.participants || [];
    if (participants.includes(other.lower)) return { error: `@${other.lower} is already in this group.`, status: 409 };
    if (participants.length >= MAX_GROUP_MEMBERS) return { error: `Groups are limited to ${MAX_GROUP_MEMBERS} members.`, status: 400 };
    return {
      participants: FV().arrayUnion(other.lower),
      participantUids: FV().arrayUnion(other.uid),
      removed: FV().arrayRemove(other.lower), // an admin adding someone back lifts their removal
    };
  });
  return refused || NextResponse.json({ ok: true });
}

async function removeMember(db, caller, { convoId, as, username }) {
  const me = await ownedUsername(db, caller.uid, as);
  if (!me) return fail("You can only act as one of your own usernames.", 403);
  const other = await anyUsername(db, username);
  if (!other) return fail("That username doesn't exist.", 404);
  if (other.lower === me.lower) return fail("Use Leave group to remove yourself.");
  const theirs = await accountUsernames(db, other.uid);

  const refused = await withGroup(db, convoId, (convo) => {
    if (!isGroupAdmin(convo, me.lower)) return { error: "Only group admins can remove members.", status: 403 };
    const participants = convo.participants || [];
    if (!participants.includes(other.lower)) return { error: `@${other.lower} isn't in this group.`, status: 400 };
    if (groupOwner(convo) === other.lower) return { error: "The owner can't be removed.", status: 403 };
    if ((convo.admins || []).includes(other.lower) && groupOwner(convo) !== me.lower) {
      return { error: "Only the owner can remove an admin.", status: 403 };
    }
    const staying = participants.some((p) => p !== other.lower && theirs.includes(p));
    return {
      participants: FV().arrayRemove(other.lower),
      admins: FV().arrayRemove(other.lower),
      removed: FV().arrayUnion(other.lower), // can't rejoin a public group on their own
      ...(staying ? {} : { participantUids: FV().arrayRemove(other.uid) }),
    };
  });
  return refused || NextResponse.json({ ok: true });
}

async function setAdmin(db, caller, { convoId, as, username, admin: makeAdmin }) {
  const me = await ownedUsername(db, caller.uid, as);
  if (!me) return fail("You can only act as one of your own usernames.", 403);
  const lower = norm(String(username || "").replace(/^@/, ""));

  const refused = await withGroup(db, convoId, (convo) => {
    if (groupOwner(convo) !== me.lower) return { error: "Only the group owner can change admins.", status: 403 };
    if (!(convo.participants || []).includes(lower)) return { error: `@${lower} isn't in this group.`, status: 400 };
    if (lower === me.lower) return { error: "You're the owner already.", status: 400 };
    return { admins: makeAdmin ? FV().arrayUnion(lower) : FV().arrayRemove(lower) };
  });
  return refused || NextResponse.json({ ok: true });
}

async function updateGroup(db, caller, { convoId, as, name, description, visibility }) {
  const me = await ownedUsername(db, caller.uid, as);
  if (!me) return fail("You can only act as one of your own usernames.", 403);
  if (name !== undefined && !cleanName(name)) return fail("Group name required.");

  const refused = await withGroup(db, convoId, (convo) => {
    if (!isGroupAdmin(convo, me.lower)) return { error: "Only group admins can edit the group.", status: 403 };
    const groupName = name !== undefined ? cleanName(name) : convo.groupName;
    const vis = visibility !== undefined ? visibilityOf(visibility) : visibilityOf(convo.visibility);
    return {
      groupName,
      visibility: vis,
      searchKeys: vis === "public" ? groupSearchKeys(groupName) : [],
      ...(description !== undefined ? { description: cleanDescription(description) } : {}),
    };
  });
  return refused || NextResponse.json({ ok: true });
}

// Kept (not erased) so reported messages can still be reviewed; with no members
// left, nobody can read it.
async function deleteGroup(db, caller, { convoId, as }) {
  const me = await ownedUsername(db, caller.uid, as);
  if (!me) return fail("You can only act as one of your own usernames.", 403);
  const refused = await withGroup(db, convoId, (convo) => {
    if (groupOwner(convo) !== me.lower) return { error: "Only the group owner can delete it.", status: 403 };
    return {
      deleted: true,
      deletedAt: FV().serverTimestamp(),
      formerParticipants: convo.participants || [],
      participants: [],
      participantUids: [],
      admins: [],
      visibility: "private",
      searchKeys: [],
    };
  });
  return refused || NextResponse.json({ ok: true });
}

async function deleteMessage(db, caller, { convoId, as, messageId }) {
  const me = await ownedUsername(db, caller.uid, as);
  if (!me) return fail("You can only act as one of your own usernames.", 403);
  const msgRef = db.collection("conversations").doc(String(convoId || "")).collection("messages").doc(String(messageId || ""));
  const refused = await withGroup(db, convoId, async (convo, tx) => {
    if (!isGroupAdmin(convo, me.lower)) return { error: "Only group admins can remove messages.", status: 403 };
    const msg = await tx.get(msgRef);
    if (!msg.exists) return { error: "Message not found.", status: 404 };
    tx.update(msgRef, { text: DELETED_TEXT, deletedForEveryone: true, removedBy: me.lower });
    return null;
  });
  return refused || NextResponse.json({ ok: true });
}

// The blocker deletes chat_blocks/<as>_<target> themselves; this lifts the block
// recorded on your private chat with them (clients may only add to `blocked`).
async function unblock(db, caller, { as, target }) {
  const me = await ownedUsername(db, caller.uid, as);
  if (!me) return fail("You can only act as one of your own usernames.", 403);
  const other = norm(String(target || "").replace(/^@/, ""));
  const ref = db.collection("conversations").doc(dmIdFor(me.lower, other));
  const snap = await ref.get();
  if (snap.exists && snap.data().type === "dm" && (snap.data().participants || []).includes(me.lower)) {
    await ref.update({ blocked: FV().arrayRemove(other) });
  }
  return NextResponse.json({ ok: true });
}

const ACTIONS = {
  dm: openDm,
  group: createGroup,
  join: joinGroup,
  leave: leaveGroup,
  addMember,
  removeMember,
  setAdmin,
  updateGroup,
  deleteGroup,
  deleteMessage,
  unblock,
};

export async function POST(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const body = await req.json().catch(() => ({}));
    const run = Object.hasOwn(ACTIONS, body.action) ? ACTIONS[body.action] : null;
    if (!run) return fail("Unknown action.");
    return await run(getAdminDb(), caller, body);
  } catch (e) {
    console.error("Chat conversations error:", e);
    return fail(e?.message || "Something went wrong.", 500);
  }
}
