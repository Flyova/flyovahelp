import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import {
  dmIdFor, isValidUsername, norm, ownedUsername, participantUidsFor, usernameUids,
  GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX, MAX_GROUP_MEMBERS, groupByInvite, groupOwner, groupSearchKeys, isGroupAdmin,
} from "@/lib/chat";
import { chatSettingsFor } from "@/lib/chatSettings";

// POST /api/chat/conversations — the only way conversations are created or joined.
// Firestore rules forbid clients from creating conversations or changing their
// members, so every conversation carries a trustworthy `participantUids` list
// (what the rules use to decide who may read and post): every account that can
// chat as one of its members — the owner, plus accounts logged in to the username.
//
//   { action: "dm", as, target }                              -> { id }  open/create a private chat
//   { action: "group", as, name, description?, visibility? }  -> { id }  create a group (caller owns it)
//   { action: "join", convoId, as }                           -> { id }  join a public group
//   { action: "leave", convoId, as }                          -> { ok }  leave a group (not the owner)
//   { action: "addMember", convoId, as, username }            -> { ok }  admins
//   { action: "removeMember", convoId, as, username }         -> { ok }  admins; only the owner removes admins
//   { action: "setAdmin", convoId, as, username, admin }      -> { ok }  owner only
//   { action: "updateGroup", convoId, as, name?, description?, visibility? } -> { ok }  admins
//   { action: "lockGroup", convoId, as, locked }              -> { ok }  admins: when locked, only admins can send messages
//   { action: "deleteGroup", convoId, as }                    -> { ok }  owner only
//   { action: "deleteMessage", convoId, as, messageId }       -> { ok }  admins remove anyone's message
//   { action: "unblock", as, target }                         -> { ok }  let a player you blocked message you again
//   { action: "deleteChat", convoId, as }                     -> { ok }  private chat: delete it and its messages for both people
//   { action: "inviteLink", convoId, as, op }                 -> { code }  admins: op "create", "reset" (new link) or "delete"
//   { action: "joinByLink", code, as }                        -> { id }  join a group (public or private) with its invite link

const FV = () => admin.firestore.FieldValue;
const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const DELETED_TEXT = "— message deleted —";

async function activeUsername(db, username) {
  const lower = norm(String(username || "").trim().replace(/^@/, ""));
  if (!isValidUsername(lower)) return null;
  const snap = await db.collection("usernames").doc(lower).get();
  if (!snap.exists || snap.data().deleted) return null;
  return { lower, uid: snap.data().uid, uids: usernameUids(snap.data()) };
}

// Like activeUsername, but also finds deleted usernames (they can still sit in a group).
async function anyUsername(db, username) {
  const lower = norm(String(username || "").trim().replace(/^@/, ""));
  if (!isValidUsername(lower)) return null;
  const snap = await db.collection("usernames").doc(lower).get();
  return snap.exists ? { lower, uid: snap.data().uid } : null;
}

const visibilityOf = (v) => (v === "public" ? "public" : "private");

/**
 * Posts a line like "@ade joined the group" in a group (written with the change
 * itself, in the same transaction or batch) and returns the preview update for
 * the group. Shown as a small centred line, not a message bubble.
 */
function activity(writer, db, convoId, text) {
  writer.set(db.collection("conversations").doc(convoId).collection("messages").doc(), {
    kind: "system", sender: "", text, createdAt: FV().serverTimestamp(), deletedForEveryone: false,
  });
  return { lastMessage: text, lastMessageAt: FV().serverTimestamp() };
}
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
  const participantUids = [...new Set([...usernameUids(me), ...other.uids])];
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
  } else if (participantUids.some((u) => !(snap.data().participantUids || []).includes(u))) {
    // Older conversation, or someone has logged in to one of the usernames since.
    await ref.update({ participantUids: FV().arrayUnion(...participantUids) });
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
  const batch = db.batch();
  const preview = activity(batch, db, ref.id, `@${me.lower} created the group`);
  batch.set(ref, {
    type: "group",
    groupName,
    description: cleanDescription(description),
    visibility: vis,
    searchKeys: vis === "public" ? groupSearchKeys(groupName) : [],
    participants: [me.lower],
    participantUids: usernameUids(me),
    owner: me.lower,
    admins: [me.lower],
    removed: [],
    createdBy: me.lower,
    createdAt: FV().serverTimestamp(),
    ...preview,
  });
  await batch.commit();
  return NextResponse.json({ id: ref.id });
}

async function joinGroup(db, caller, { convoId, as }) {
  const me = await ownedUsername(db, caller.uid, as);
  if (!me) return fail("You can only chat as one of your own usernames.", 403);
  const refused = await withGroup(db, convoId, (convo, tx) => {
    if ((convo.participants || []).includes(me.lower)) return null; // already in
    if (convo.visibility !== "public") return { error: "This group is private. Ask an admin to add you.", status: 403 };
    if ((convo.removed || []).includes(me.lower)) return { error: "An admin removed you from this group.", status: 403 };
    if ((convo.participants || []).length >= MAX_GROUP_MEMBERS) return { error: `This group is full (${MAX_GROUP_MEMBERS} members).`, status: 400 };
    return {
      participants: FV().arrayUnion(me.lower),
      participantUids: FV().arrayUnion(...usernameUids(me)),
      ...activity(tx, db, convoId, `@${me.lower} joined the group`),
    };
  });
  return refused || NextResponse.json({ id: String(convoId) });
}

async function leaveGroup(db, caller, { convoId, as }) {
  const me = await ownedUsername(db, caller.uid, as);
  if (!me) return fail("You can only act as one of your own usernames.", 403);
  const refused = await withGroup(db, convoId, async (convo, tx) => {
    const participants = convo.participants || [];
    if (!participants.includes(me.lower)) return { error: "You're not in this group.", status: 400 };
    if (groupOwner(convo) === me.lower) return { error: "You own this group. Delete it instead of leaving.", status: 400 };
    const remaining = participants.filter((p) => p !== me.lower);
    const participantUids = await participantUidsFor((...refs) => tx.getAll(...refs), db, remaining);
    return {
      participants: FV().arrayRemove(me.lower),
      admins: FV().arrayRemove(me.lower),
      participantUids,
      ...activity(tx, db, convoId, `@${me.lower} left the group`),
    };
  });
  return refused || NextResponse.json({ ok: true });
}

async function addMember(db, caller, { convoId, as, username }) {
  const me = await ownedUsername(db, caller.uid, as);
  if (!me) return fail("You can only act as one of your own usernames.", 403);
  const other = await activeUsername(db, username);
  if (!other) return fail("That username doesn't exist.", 404);
  // Chat settings → Privacy: some players only join groups themselves.
  const settings = await chatSettingsFor(db, [{ name: other.lower, uid: other.uid }]);
  if (settings.get(other.lower)?.allowGroupAdds === false) {
    return fail(`@${other.lower} only joins groups themselves. Send them the group link instead.`, 403);
  }

  const refused = await withGroup(db, convoId, (convo, tx) => {
    if (!isGroupAdmin(convo, me.lower)) return { error: "Only group admins can add members.", status: 403 };
    const participants = convo.participants || [];
    if (participants.includes(other.lower)) return { error: `@${other.lower} is already in this group.`, status: 409 };
    if (participants.length >= MAX_GROUP_MEMBERS) return { error: `Groups are limited to ${MAX_GROUP_MEMBERS} members.`, status: 400 };
    return {
      participants: FV().arrayUnion(other.lower),
      participantUids: FV().arrayUnion(...other.uids),
      removed: FV().arrayRemove(other.lower), // an admin adding someone back lifts their removal
      ...activity(tx, db, convoId, `@${me.lower} added @${other.lower}`),
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

  const refused = await withGroup(db, convoId, async (convo, tx) => {
    if (!isGroupAdmin(convo, me.lower)) return { error: "Only group admins can remove members.", status: 403 };
    const participants = convo.participants || [];
    if (!participants.includes(other.lower)) return { error: `@${other.lower} isn't in this group.`, status: 400 };
    if (groupOwner(convo) === other.lower) return { error: "The owner can't be removed.", status: 403 };
    if ((convo.admins || []).includes(other.lower) && groupOwner(convo) !== me.lower) {
      return { error: "Only the owner can remove an admin.", status: 403 };
    }
    const remaining = participants.filter((p) => p !== other.lower);
    const participantUids = await participantUidsFor((...refs) => tx.getAll(...refs), db, remaining);
    return {
      participants: FV().arrayRemove(other.lower),
      admins: FV().arrayRemove(other.lower),
      removed: FV().arrayUnion(other.lower), // can't rejoin a public group on their own
      participantUids,
      ...activity(tx, db, convoId, `@${me.lower} removed @${other.lower}`),
    };
  });
  return refused || NextResponse.json({ ok: true });
}

async function setAdmin(db, caller, { convoId, as, username, admin: makeAdmin }) {
  const me = await ownedUsername(db, caller.uid, as);
  if (!me) return fail("You can only act as one of your own usernames.", 403);
  const lower = norm(String(username || "").replace(/^@/, ""));

  const refused = await withGroup(db, convoId, (convo, tx) => {
    if (groupOwner(convo) !== me.lower) return { error: "Only the group owner can change admins.", status: 403 };
    if (!(convo.participants || []).includes(lower)) return { error: `@${lower} isn't in this group.`, status: 400 };
    if (lower === me.lower) return { error: "You're the owner already.", status: 400 };
    return {
      admins: makeAdmin ? FV().arrayUnion(lower) : FV().arrayRemove(lower),
      ...activity(tx, db, convoId, makeAdmin ? `@${me.lower} made @${lower} an admin` : `@${me.lower} removed @${lower} as admin`),
    };
  });
  return refused || NextResponse.json({ ok: true });
}

async function updateGroup(db, caller, { convoId, as, name, description, visibility }) {
  const me = await ownedUsername(db, caller.uid, as);
  if (!me) return fail("You can only act as one of your own usernames.", 403);
  if (name !== undefined && !cleanName(name)) return fail("Group name required.");

  const refused = await withGroup(db, convoId, (convo, tx) => {
    if (!isGroupAdmin(convo, me.lower)) return { error: "Only group admins can edit the group.", status: 403 };
    const groupName = name !== undefined ? cleanName(name) : convo.groupName;
    const vis = visibility !== undefined ? visibilityOf(visibility) : visibilityOf(convo.visibility);
    const desc = description !== undefined ? cleanDescription(description) : convo.description || "";
    // One line naming everything that actually changed.
    const changes = [
      groupName !== convo.groupName && `renamed the group to "${groupName}"`,
      desc !== (convo.description || "") && "changed the group description",
      vis !== visibilityOf(convo.visibility) && `made the group ${vis}`,
    ].filter(Boolean);
    const said = changes.length > 1 ? `${changes.slice(0, -1).join(", ")} and ${changes[changes.length - 1]}` : changes[0];
    const preview = said ? activity(tx, db, convoId, `@${me.lower} ${said}`) : {};
    return {
      groupName,
      visibility: vis,
      searchKeys: vis === "public" ? groupSearchKeys(groupName) : [],
      description: desc,
      ...preview,
    };
  });
  return refused || NextResponse.json({ ok: true });
}

// A locked group takes messages only from its owner and admins (Firestore rules
// enforce it on every message); unlocking lets every member write again.
async function lockGroup(db, caller, { convoId, as, locked }) {
  const me = await ownedUsername(db, caller.uid, as);
  if (!me) return fail("You can only act as one of your own usernames.", 403);
  const lock = locked === true;

  const refused = await withGroup(db, convoId, (convo, tx) => {
    if (!isGroupAdmin(convo, me.lower)) return { error: "Only group admins can lock or unlock the group.", status: 403 };
    if (!!convo.locked === lock) return null;
    return {
      locked: lock,
      ...activity(tx, db, convoId, lock ? `@${me.lower} locked the group. Only admins can send messages` : `@${me.lower} unlocked the group. Everyone can send messages`),
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

// Deleted for both people: the messages and the chat itself. Writing to each other
// again starts a fresh chat.
async function deleteChat(db, caller, { convoId, as }) {
  const me = await ownedUsername(db, caller.uid, as);
  if (!me) return fail("You can only act as one of your own usernames.", 403);
  const ref = db.collection("conversations").doc(String(convoId || ""));
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ ok: true });
  const convo = snap.data();
  if (convo.type === "group") return fail("Groups can't be deleted this way. Leave the group, or delete it if you own it.");
  if (!(convo.participants || []).includes(me.lower)) return fail("You're not in this chat.", 403);
  for (;;) {
    const page = await ref.collection("messages").limit(400).get();
    if (page.empty) break;
    const batch = db.batch();
    page.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (page.size < 400) break;
  }
  await ref.delete();
  return NextResponse.json({ ok: true });
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const newInviteCode = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");

// A group's invite link (/chat/join/<code>): anyone with it can join, even a private
// group. Admins create it, swap it for a new one (the old link stops working) or delete it.
async function inviteLink(db, caller, { convoId, as, op }) {
  const me = await ownedUsername(db, caller.uid, as);
  if (!me) return fail("You can only act as one of your own usernames.", 403);
  if (!["create", "reset", "delete"].includes(op)) return fail("Unknown link action.");
  let code = "";
  const refused = await withGroup(db, convoId, (convo) => {
    if (!isGroupAdmin(convo, me.lower)) return { error: "Only group admins can manage the group link.", status: 403 };
    if (op === "delete") return { inviteCode: "" };
    if (op === "create" && convo.inviteCode) {
      code = convo.inviteCode;
      return null;
    }
    code = newInviteCode();
    return { inviteCode: code };
  });
  return refused || NextResponse.json({ code });
}

async function joinByLink(db, caller, { code, as }) {
  const me = await ownedUsername(db, caller.uid, as);
  if (!me) return fail("You can only chat as one of your own usernames.", 403);
  const group = await groupByInvite(db, code);
  if (!group) return fail("This group link doesn't work any more. Ask an admin for a new one.", 404);
  const refused = await withGroup(db, group.id, (convo, tx) => {
    if ((convo.participants || []).includes(me.lower)) return null; // already in
    if (convo.inviteCode !== code) return { error: "This group link doesn't work any more. Ask an admin for a new one.", status: 404 };
    if ((convo.removed || []).includes(me.lower)) return { error: "An admin removed you from this group.", status: 403 };
    if ((convo.participants || []).length >= MAX_GROUP_MEMBERS) return { error: `This group is full (${MAX_GROUP_MEMBERS} members).`, status: 400 };
    return {
      participants: FV().arrayUnion(me.lower),
      participantUids: FV().arrayUnion(...usernameUids(me)),
      ...activity(tx, db, group.id, `@${me.lower} joined with the group link`),
    };
  });
  return refused || NextResponse.json({ id: group.id });
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
  lockGroup,
  deleteGroup,
  deleteMessage,
  unblock,
  deleteChat,
  inviteLink,
  joinByLink,
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
