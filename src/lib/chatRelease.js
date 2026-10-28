import { admin } from "@/lib/firebaseAdmin";
import { groupOwner, participantUidsFor } from "@/lib/chat";
import { settleUsernameWallet } from "@/lib/coinWallets";

// Freeing deleted chat usernames. Deleting one marks usernames/{name} `deleted`;
// releasing it then clears everything tied to the name and removes that doc, so
// anyone can register the name again as a fresh player. Server only.

const FV = () => admin.firestore.FieldValue;
const PAGE = 400;
// Kept after release (server only) so username pricing still counts deleted names.
export const DELETED_USERNAMES = "usernames_deleted";

const without = (map, key) => Object.fromEntries(Object.entries(map || {}).filter(([k]) => k !== key));

// Deletes every document `query` finds, a page at a time.
async function deleteAll(db, query) {
  for (;;) {
    const page = await query.limit(PAGE).get();
    if (page.empty) return;
    const batch = db.batch();
    page.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (page.size < PAGE) return;
  }
}

/**
 * Takes `name` out of a group as if it had left: members, admins, the removed and
 * blocked lists (so a new owner of the name isn't banned) and its typing/seen marks.
 * If it owned the group, an admin takes over, or else the longest-standing member;
 * a group left with nobody is deleted.
 */
async function leaveGroup(db, convoId, name) {
  const ref = db.collection("conversations").doc(convoId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().type !== "group" || snap.data().deleted) return;
    const c = snap.data();
    const strip = (list) => (list || []).filter((p) => p !== name);
    const cleared = { removed: strip(c.removed), blocked: strip(c.blocked), typing: without(c.typing, name), readAt: without(c.readAt, name) };
    if (!(c.participants || []).includes(name)) {
      tx.update(ref, cleared);
      return;
    }

    const participants = strip(c.participants);
    if (!participants.length) {
      tx.update(ref, {
        ...cleared,
        deleted: true,
        deletedAt: FV().serverTimestamp(),
        formerParticipants: c.participants,
        participants: [],
        participantUids: [],
        admins: [],
        visibility: "private",
        searchKeys: [],
      });
      return;
    }
    let admins = strip(c.admins);
    let owner = groupOwner(c);
    const lines = [`@${name} left the group`];
    if (owner === name) {
      owner = admins[0] || participants[0];
      if (!admins.includes(owner)) admins = [...admins, owner];
      lines.push(`@${owner} is now the group owner`);
    }
    const participantUids = await participantUidsFor((...refs) => tx.getAll(...refs), db, participants);
    for (const text of lines) {
      tx.set(ref.collection("messages").doc(), { kind: "system", sender: "", text, createdAt: FV().serverTimestamp(), deletedForEveryone: false });
    }
    tx.update(ref, {
      ...cleared, participants, participantUids, admins, owner,
      lastMessage: lines[lines.length - 1], lastMessageAt: FV().serverTimestamp(),
    });
  });
}

/**
 * A private chat with a deleted username stays, read-only, for the other player:
 * `closed`, with the deleted names in `departed`, and readable only by the other
 * player's accounts. New messages between those names go to a fresh chat
 * (liveDmRef). Once both players are gone, it's deleted.
 */
async function closePrivateChat(db, ref, name) {
  const empty = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const c = snap.data();
    const departed = [...new Set([...(c.departed || []), name])];
    const left = (c.participants || []).filter((p) => !departed.includes(p));
    if (!left.length) return true;
    const participantUids = await participantUidsFor((...refs) => tx.getAll(...refs), db, left);
    tx.update(ref, { closed: true, departed, participantUids, typing: without(c.typing, name), readAt: without(c.readAt, name) });
    return false;
  });
  if (empty) {
    await deleteAll(db, ref.collection("messages"));
    await ref.delete();
  }
}

/**
 * Frees deleted username `name` (usernames/{name} with `deleted: true`) for anyone
 * to register: its coins move to the owner's main username; it leaves its groups;
 * its private chats are closed, read-only for the other player (closePrivateChat);
 * its profile and photo, settings, online status, password, PIN, blocks and group
 * invites go. Safe to
 * re-run, and the doc goes last, so a release that stops half way is finished by
 * the daily cleanup (/api/cron/cleanup-chats). Resolves to false if `name` isn't
 * a deleted username.
 */
export async function releaseUsername(db, name) {
  const nameRef = db.collection("usernames").doc(name);
  const snap = await nameRef.get();
  if (!snap.exists || !snap.data().deleted) return false;

  // Its coins go to the owner's main username first; the next owner starts at 0.
  await settleUsernameWallet(db, name);

  const chats = db.collection("conversations");
  const [memberOf, removedFrom] = await Promise.all([
    chats.where("participants", "array-contains", name).get(),
    chats.where("removed", "array-contains", name).get(),
  ]);
  const groups = new Set([...memberOf.docs, ...removedFrom.docs].filter((d) => d.data().type === "group").map((d) => d.id));
  for (const id of groups) await leaveGroup(db, id, name);
  for (const d of memberOf.docs.filter((x) => x.data().type === "dm")) await closePrivateChat(db, d.ref, name);
  await deleteAll(db, db.collection("chat_blocks").where("blocker", "==", name));
  await deleteAll(db, db.collection("chat_blocks").where("blocked", "==", name));
  // Group invites to it would reach the name's next owner; ones it sent go too.
  await deleteAll(db, db.collection("group_invites").where("name", "==", name));
  await deleteAll(db, db.collection("group_invites").where("by", "==", name));

  const data = snap.data();
  const batch = db.batch();
  for (const col of ["chat_profiles", "chat_presence", "chat_settings", "username_auth", "username_locks"]) {
    batch.delete(db.collection(col).doc(name));
  }
  batch.set(db.collection(DELETED_USERNAMES).doc(`${name}_${data.deletedAt?.toMillis?.() || Date.now()}`), {
    ...data, releasedAt: FV().serverTimestamp(),
  });
  batch.delete(nameRef);
  await batch.commit();
  return true;
}

/** How many usernames account `uid` has deleted and released: added to usernameCharge's `owned`. */
export async function releasedUsernameCount(db, uid) {
  return (await db.collection(DELETED_USERNAMES).where("uid", "==", uid).count().get()).data().count;
}

/**
 * For a deleted account: logs it out of other players' usernames, then deletes
 * and releases every username it owns, its main one included. A name whose
 * release fails stays marked deleted for the daily cleanup to finish.
 */
export async function releaseAccountUsernames(db, uid) {
  const usernames = db.collection("usernames");
  const [owned, linked] = await Promise.all([
    usernames.where("uid", "==", uid).get(),
    usernames.where("linkedUids", "array-contains", uid).get(),
  ]);
  for (const d of linked.docs) await d.ref.update({ linkedUids: FV().arrayRemove(uid) });
  for (const d of owned.docs) {
    if (!d.data().deleted) await d.ref.update({ deleted: true, deletedAt: FV().serverTimestamp() });
  }
  for (const d of owned.docs) {
    await releaseUsername(db, d.id).catch((e) => console.error(`Releasing @${d.id} failed:`, e));
  }
}

/** Releases up to `limit` deleted usernames not yet freed. Resolves to how many it freed. */
export async function releasePendingUsernames(db, limit = 50) {
  const pending = await db.collection("usernames").where("deleted", "==", true).limit(limit).get();
  let freed = 0;
  for (const d of pending.docs) {
    if (await releaseUsername(db, d.id).catch((e) => console.error(`Releasing @${d.id} failed:`, e))) freed += 1;
  }
  return freed;
}
