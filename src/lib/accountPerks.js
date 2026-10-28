// Perks for accounts at least 18 months old: one free USDT withdrawal of $100 to
// $1,000 on the 15th of each month (UTC), and the referral bonus unlocks with 2
// qualified referrals instead of 10. No server imports, so the pages show the same
// rule /api/wallet applies (the app keeps a copy in src/lib/wallet.ts).

export const OLD_ACCOUNT_MONTHS = 18;
export const FREE_WITHDRAWAL = { day: 15, min: 100, max: 1000 };
export const OLD_ACCOUNT_QUALIFIED_REFERRALS = 2;

/** `ms` plus `months` calendar months (UTC). */
export function addMonths(ms, months) {
  const d = new Date(ms);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.getTime();
}

/** Whether an account made at `createdMs` is at least OLD_ACCOUNT_MONTHS old. */
export const isOldAccount = (createdMs, now = Date.now()) =>
  Number.isFinite(createdMs) && createdMs > 0 && now >= addMonths(createdMs, OLD_ACCOUNT_MONTHS);

/** "2026-10": the UTC month, as stored in users/{uid}.freeWithdrawalMonth once that month's free withdrawal is used. */
export const monthKey = (now = new Date()) => now.toISOString().slice(0, 7);

/** The free withdrawal's day and amount: the 15th (UTC), $100–$1,000. */
export const inFreeWithdrawalWindow = (amount, now = new Date()) =>
  now.getUTCDate() === FREE_WITHDRAWAL.day && amount >= FREE_WITHDRAWAL.min && amount <= FREE_WITHDRAWAL.max;

/** Whether a USDT withdrawal of `amount` is free: an old account, on the 15th, $100–$1,000, not used yet this month. */
export const isFreeWithdrawal = ({ createdMs, amount, usedMonth, now = new Date() }) =>
  inFreeWithdrawalWindow(amount, now) && usedMonth !== monthKey(now) && isOldAccount(createdMs, now.getTime());
