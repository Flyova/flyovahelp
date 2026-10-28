import { DEPOSIT_LOCK_MS, DEPOSIT_WINDOW_MS, FV, INVALID_DEPOSIT_LIMIT, INVALID_DEPOSIT_WINDOW_MS, formatUsd } from "@/lib/money";
import { alertAdmins, notifyUser } from "@/lib/notifications";

// A deposit request the player never paid: a USDT deposit whose 30-minute window ran
// out with no proof, one an admin rejected, or an agent deposit the agent marked
// unpaid. INVALID_DEPOSIT_LIMIT of them within 24 hours locks deposits for 48 hours
// (users/{uid}.depositLockedUntil, checked by /api/wallet and /api/trades).
// users/{uid}.invalidDeposits keeps the recent ones as { id, at } so each counts once.

/** Counts one unpaid deposit request. Returns true if it locked deposits. Never throws. */
export async function recordInvalidDeposit(db, uid, { sourceId, what }) {
  if (!uid || !sourceId) return false;
  const userRef = db.collection("users").doc(uid);
  try {
    const locked = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) return false;
      const now = Date.now();
      const recent = (Array.isArray(snap.data().invalidDeposits) ? snap.data().invalidDeposits : [])
        .filter((d) => d && now - Number(d.at) < INVALID_DEPOSIT_WINDOW_MS);
      if (recent.some((d) => d.id === sourceId)) return false;
      recent.push({ id: sourceId, at: now });
      if (recent.length >= INVALID_DEPOSIT_LIMIT) {
        tx.update(userRef, { invalidDeposits: [], depositLockedUntil: now + DEPOSIT_LOCK_MS, depositLockedAt: FV().serverTimestamp() });
        return true;
      }
      tx.update(userRef, { invalidDeposits: recent });
      return false;
    });
    if (locked) {
      await Promise.all([
        notifyUser(db, uid, {
          type: "warning", title: "Deposits locked for 48 hours",
          body: `${INVALID_DEPOSIT_LIMIT} deposit requests in 24 hours weren't paid, so new deposits are paused for 48 hours. Only start a deposit when you're ready to pay.`,
          url: "/deposit",
        }),
        alertAdmins(db, { type: "deposit_lock", title: "Deposits locked: unpaid requests", body: `${INVALID_DEPOSIT_LIMIT} unpaid deposit requests in 24 hours (last: ${what}). Deposits are locked for 48 hours.`, uid, url: "/admin/users?flagged=1" }),
      ]);
    }
    return locked;
  } catch (e) {
    console.error("Recording an unpaid deposit failed:", e?.message || e);
    return false;
  }
}

const ms = (ts) => ts?.toMillis?.() || Number(ts || 0);

/**
 * Cancels USDT deposits left unpaid past their 30-minute window with no proof sent,
 * each counting toward the lock. Run every minute (/api/cron/watch) and by the
 * deposit page's cleanup call. Checks every pending one, or just `docs`. Returns how
 * many it cancelled.
 */
export async function expireUnpaidDeposits(db, docs) {
  const open = docs || (await db.collection("deposits").where("status", "==", "pending").get()).docs;
  let cancelled = 0;
  for (const doc of open) {
    const d = doc.data();
    if (d.submittedAt || d.transactionHash || d.proofImage) continue; // proof sent: waiting for an admin
    if (!ms(d.createdAt) || Date.now() - ms(d.createdAt) < DEPOSIT_WINDOW_MS) continue;
    const done = await db.runTransaction(async (tx) => {
      const snap = await tx.get(doc.ref);
      const now = snap.data();
      if (now?.status !== "pending" || now.submittedAt || now.transactionHash || now.proofImage) return false;
      tx.update(doc.ref, { status: "cancelled", cancelledAt: FV().serverTimestamp(), cancelReason: "expired" });
      return true;
    });
    if (!done) continue;
    cancelled += 1;
    await recordInvalidDeposit(db, d.userId, { sourceId: `deposit_${doc.id}`, what: `a ${formatUsd(d.amount)} USDT deposit left unpaid` });
  }
  return cancelled;
}
