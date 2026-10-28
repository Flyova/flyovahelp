// Shared by the admin pages: why lib/notifications flagged an account
// (users/{uid}.flagReason) and how many jackpots each player was credited.

const FLAG_REASONS = {
  manual_credit: "Money added manually",
  withdrawal_unconfirmed: "Agent withdrawal not confirmed in 45 min",
};

export const flagReasonLabel = (reason) => FLAG_REASONS[reason] || reason || "Flagged";

/** Firestore Timestamp or ms → Date, or null. */
export const toDate = (ts) => (ts?.toDate ? ts.toDate() : typeof ts === "number" && ts > 0 ? new Date(ts) : null);

/** Deposits paused after unpaid requests (lib/depositLock). */
export const depositLocked = (u) => Number(u?.depositLockedUntil?.toMillis?.() || u?.depositLockedUntil || 0) > Date.now();

/** Jackpot docs → { [uid]: { claimed, pending, total } } (total = claimed amounts). */
export function groupJackpots(docs) {
  const byUser = {};
  for (const d of docs) {
    const j = typeof d.data === "function" ? d.data() : d;
    if (!j.userId) continue;
    const row = (byUser[j.userId] ||= { claimed: 0, pending: 0, total: 0 });
    if (j.status === "claimed") {
      row.claimed += 1;
      row.total += Number(j.amount || 0);
    } else if (j.status === "pending") {
      row.pending += 1;
    }
  }
  return byUser;
}
