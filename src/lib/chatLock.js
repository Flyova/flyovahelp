import { admin } from "@/lib/firebaseAdmin";
import { resolvePrivilegedRole } from "@/lib/adminAccess";
import { CHAT_LOCK_REPORTS, CHAT_UNLOCK_PRICE, chatLockMessage } from "@/lib/chat";
import { alertAdmins, notifyUser } from "@/lib/notifications";
import { recordPurchase } from "@/lib/purchases";

// Server side of the Chats lock (lib/chat CHAT_UNLOCK_PRICE): users/{uid}.chatLocked,
// chatLockReason ("admin" | "reports"), chatLockedAt, chatLockedBy (the admin's uid),
// chatUnlockedAt; and ownerChatLocked on every usernames/{name} the account owns, so
// the rules and routes that already read a username see the lock without another read.

const FV = () => admin.firestore.FieldValue;
const ms = (v) => Number(v?.toMillis?.() || v || 0);

/** Sets ownerChatLocked on every username `uid` owns, inside transaction `tx`. */
async function markUsernames(tx, db, uid, locked) {
  const owned = await tx.get(db.collection("usernames").where("uid", "==", uid));
  owned.docs.forEach((d) => tx.update(d.ref, { ownerChatLocked: locked ? true : FV().delete() }));
}

/**
 * Locks account `uid` out of Chats. `reason` "admin" (with `by`, the admin's uid) or
 * "reports". Staff accounts are never locked. Returns { ok } or { error, status }.
 */
export async function lockChats(db, uid, { reason, by = null }) {
  const ref = db.collection("users").doc(uid);
  const out = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { error: "That player no longer exists.", status: 404 };
    const u = snap.data();
    if (resolvePrivilegedRole(u.role, u.email)) return { error: "StraWins staff can't be locked from Chats.", status: 403 };
    if (u.chatLocked === true) return { ok: true, already: true };
    await markUsernames(tx, db, uid, true);
    tx.update(ref, { chatLocked: true, chatLockReason: reason, chatLockedAt: FV().serverTimestamp(), chatLockedBy: by });
    return { ok: true };
  });
  if (out.ok && !out.already) {
    await notifyUser(db, uid, {
      type: "account", title: "Locked from Chats", url: "/chat",
      body: chatLockMessage({ chatLocked: true, chatLockReason: reason }),
    });
  }
  return out;
}

/**
 * Lifts the lock on `uid`: paid (the player's $12, taken in the same transaction) or
 * free (an admin, `by`). Returns { ok } or { error, status }.
 */
export async function unlockChats(db, uid, { paid = false, by = null }) {
  const ref = db.collection("users").doc(uid);
  const out = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { error: "Account not found.", status: 404 };
    const u = snap.data();
    if (u.chatLocked !== true) return { error: "This account isn't locked from Chats.", status: 409 };
    const price = Math.round(CHAT_UNLOCK_PRICE * 100);
    if (paid && Math.round(Number(u.wallet || 0) * 100) < price) {
      return { error: `Unlocking Chats costs $${CHAT_UNLOCK_PRICE.toFixed(2)} from your main wallet; you have $${Number(u.wallet || 0).toFixed(2)}.`, status: 402 };
    }
    await markUsernames(tx, db, uid, false);
    tx.update(ref, {
      chatLocked: false, chatUnlockedAt: FV().serverTimestamp(),
      chatLockReason: FV().delete(), chatLockedAt: FV().delete(), chatLockedBy: FV().delete(),
      ...(paid ? { wallet: FV().increment(-CHAT_UNLOCK_PRICE) } : {}),
    });
    if (paid) {
      const txRef = ref.collection("transactions").doc();
      tx.set(txRef, {
        title: "Chats Unlocked", amount: -CHAT_UNLOCK_PRICE, type: "chat_unlock", category: "finance", status: "completed",
        description: u.chatLockReason === "reports" ? "Locked after players' reports" : "Locked by an admin",
        timestamp: FV().serverTimestamp(), createdAt: FV().serverTimestamp(),
      });
      recordPurchase(tx, db, { kind: "chat_unlock", uid, amount: CHAT_UNLOCK_PRICE, item: "Chats unlocked", txId: txRef.id });
    }
    return { ok: true };
  });
  if (out.ok) {
    await notifyUser(db, uid, {
      type: "account", title: "Chats unlocked", url: "/chat",
      body: paid ? `You paid $${CHAT_UNLOCK_PRICE} and can chat again.` : "An admin lifted the lock on your Chats. You can chat again.",
    });
  }
  return out;
}

/**
 * The number of different accounts with an open report against account `uid` (any of
 * its usernames), counting only reports made since its last unlock.
 */
export async function openReporterCount(db, uid, since = 0) {
  const snap = await db.collection("chat_reports").where("reportedUid", "==", uid).where("status", "==", "open")
    .select("reporterUid", "createdAt").get();
  const reporters = new Set();
  for (const d of snap.docs) {
    const r = d.data();
    if (r.reporterUid && r.reporterUid !== uid && ms(r.createdAt) > since) reporters.add(r.reporterUid);
  }
  return reporters.size;
}

/** After a report: locks `uid` once CHAT_LOCK_REPORTS different accounts have open reports against it. */
export async function lockIfReported(db, uid) {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return false;
  const u = snap.data();
  if (u.chatLocked === true || resolvePrivilegedRole(u.role, u.email)) return false;
  if ((await openReporterCount(db, uid, ms(u.chatUnlockedAt))) < CHAT_LOCK_REPORTS) return false;
  const out = await lockChats(db, uid, { reason: "reports" });
  if (!out.ok || out.already) return false;
  await alertAdmins(db, {
    type: "chat_lock", title: "Locked from Chats by reports", uid, url: `/admin/users/${uid}`,
    body: `${u.username ? `@${u.username}` : "A player"} was locked from Chats after ${CHAT_LOCK_REPORTS} different players reported them. They can pay $${CHAT_UNLOCK_PRICE} to unlock it, or you can lift it in Admin → Users.`,
  });
  return true;
}
