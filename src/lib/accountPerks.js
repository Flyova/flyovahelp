// Account perks. No server imports, so the pages show the same rules /api/wallet
// applies (the app keeps a copy in src/lib/wallet.ts).
//
// Free USDT withdrawals: each perk below waives the withdrawal fee once a month (UTC),
// on its days, for an amount in its range. Perks on the same days share that one use, so
// an 18-month agent gets one free withdrawal on the 15th, not two. users/{uid}.freeWithdrawals
// = { [perk id]: "YYYY-MM" } records the month each was used (older accounts:
// freeWithdrawalMonth for the 18-month one). The referral bonus unlocks with 2 qualified
// referrals instead of 10 once an account is 18 months old.

export const OLD_ACCOUNT_MONTHS = 18;
export const OLD_ACCOUNT_QUALIFIED_REFERRALS = 2;

const country = (name) => String(name || "").trim().toLowerCase().replace(/^the /, "");
const ALIASES = {
  usa: "united states", "united states of america": "united states", us: "united states",
  uk: "united kingdom", "great britain": "united kingdom", britain: "united kingdom",
  "russian federation": "russia", "people's republic of china": "china",
  "the netherlands": "netherlands", holland: "netherlands",
};
const countryKey = (name) => ALIASES[country(name)] || country(name);

/**
 * `who`: agents, or accounts at least `months` old (in `countries` if given).
 * `days`: first and last day of the month (UTC). `min`/`max`: the amount, in dollars.
 */
export const FREE_WITHDRAWAL_PERKS = [
  { id: "agent15", label: "Agents", who: { agent: true }, days: [15, 15], min: 50, max: 100 },
  { id: "old18", label: "Accounts 18+ months old", who: { months: 18 }, days: [15, 15], min: 100, max: 200 },
  {
    id: "c11", label: "Accounts 11+ months old in the US, UK, Canada, Australia, Finland, China, Japan, Singapore, Russia and South Africa",
    who: { months: 11, countries: ["United States", "United Kingdom", "Canada", "Australia", "Finland", "China", "Japan", "Singapore", "Russia", "South Africa"] },
    days: [5, 10], min: 100, max: 100,
  },
  {
    id: "c12", label: "Accounts 12+ months old in New Zealand, Switzerland and the Netherlands",
    who: { months: 12, countries: ["New Zealand", "Switzerland", "Netherlands"] },
    days: [5, 8], min: 250, max: 500,
  },
];

/** `ms` plus `months` calendar months (UTC). */
export function addMonths(ms, months) {
  const d = new Date(ms);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.getTime();
}

/** Whether an account made at `createdMs` is at least `months` old. */
export const isAccountOlderThan = (createdMs, months, now = Date.now()) =>
  Number.isFinite(createdMs) && createdMs > 0 && now >= addMonths(createdMs, months);

/** Whether an account made at `createdMs` is at least OLD_ACCOUNT_MONTHS old. */
export const isOldAccount = (createdMs, now = Date.now()) => isAccountOlderThan(createdMs, OLD_ACCOUNT_MONTHS, now);

/** "2026-10": the UTC month a free withdrawal was used in. */
export const monthKey = (now = new Date()) => now.toISOString().slice(0, 7);

/** The perks whose day and amount match (who's eligible aside): to know when to look the account up. */
export const freeWithdrawalCouldApply = (amount, now = new Date()) =>
  FREE_WITHDRAWAL_PERKS.some((p) => now.getUTCDate() >= p.days[0] && now.getUTCDate() <= p.days[1] && amount >= p.min && amount <= p.max);

/** The month each perk was last used: users/{uid}.freeWithdrawals, plus the older freeWithdrawalMonth. */
export const usedFreeWithdrawals = (user) => ({
  ...(user?.freeWithdrawalMonth ? { old18: user.freeWithdrawalMonth } : {}),
  ...(user?.freeWithdrawals && typeof user.freeWithdrawals === "object" ? user.freeWithdrawals : {}),
});

/** Whether the account qualifies for `perk` at all (age, agent, country). */
export function qualifiesFor(perk, { createdMs, isAgent, country: where, now = new Date() }) {
  if (perk.who.agent) return isAgent === true;
  if (!isAccountOlderThan(createdMs, perk.who.months, now.getTime())) return false;
  return !perk.who.countries || perk.who.countries.some((c) => countryKey(c) === countryKey(where));
}

/** Whether `perk`, or another perk on any of the same days, was used in `now`'s month. */
const usedThisMonth = (perk, used, now) => FREE_WITHDRAWAL_PERKS.some((p) =>
  used[p.id] === monthKey(now) && p.days[0] <= perk.days[1] && perk.days[0] <= p.days[1]);

/**
 * The perk that makes a USDT withdrawal of `amount` free right now, or null: one the
 * account qualifies for, on its days, in its range, not used yet this month.
 */
export function freeWithdrawalPerk({ createdMs, isAgent, country: where, used = {}, amount, now = new Date() }) {
  const day = now.getUTCDate();
  return FREE_WITHDRAWAL_PERKS.find((p) => day >= p.days[0] && day <= p.days[1] && amount >= p.min && amount <= p.max
    && !usedThisMonth(p, used, now) && qualifiesFor(p, { createdMs, isAgent, country: where, now })) || null;
}

/** The perks an account qualifies for (for showing them), with whether each is used this month. */
export const freeWithdrawalPerksFor = ({ createdMs, isAgent, country: where, used = {}, now = new Date() }) =>
  FREE_WITHDRAWAL_PERKS.filter((p) => qualifiesFor(p, { createdMs, isAgent, country: where, now }))
    .map((p) => ({ ...p, usedThisMonth: usedThisMonth(p, used, now) }));

/** "the 15th", "the 5th–10th". */
export const perkDays = (p) => {
  const th = (n) => `${n}${[, "st", "nd", "rd"][(n % 100 >> 3) ^ 1 && n % 10] || "th"}`;
  return p.days[0] === p.days[1] ? `the ${th(p.days[0])}` : `the ${th(p.days[0])}–${th(p.days[1])}`;
};
