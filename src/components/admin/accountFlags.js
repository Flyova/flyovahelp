// Shared by the admin pages: why lib/notifications flagged an account
// (users/{uid}.flagReason), how many jackpots each player was credited, and which
// account details they changed from an emailed link (users/{uid}.profileChanges).

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

const PROFILE_FIELDS = [["fullName", "Name"], ["email", "Email"], ["phone", "Phone"], ["dob", "Date of birth"]];

/** [{ key, label, count }] for each detail the player has changed (name, email, phone, date of birth). */
export const profileChangeCounts = (u) =>
  PROFILE_FIELDS.map(([key, label]) => ({ key, label, count: Number(u?.profileChanges?.[key] || 0) })).filter((c) => c.count > 0);

/** Changed details before the counts were kept: only users/{uid}.profileChangedAt says so. */
export const changedBeforeCounts = (u) => !!u?.profileChangedAt && profileChangeCounts(u).length === 0;
