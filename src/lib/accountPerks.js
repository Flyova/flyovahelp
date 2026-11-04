// Account perks. No server imports, so the pages show the same rules /api/wallet
// applies (the app keeps a copy in src/lib/wallet.ts).
//
// Free USDT withdrawals: each perk below waives the withdrawal fee once a month (UTC), or
// once every `every` months, on its days, for an amount in its range. Perks on the same days
// share that one use, so an 18-month agent gets one free withdrawal on the 15th, not two. users/{uid}.freeWithdrawals
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
 * `every`: months from one use to the next (1 if not given).
 */
export const FREE_WITHDRAWAL_PERKS = [
  { id: "agent15", label: "Agents", who: { agent: true }, days: [15, 15], min: 50, max: 100 },
  { id: "old18", label: "Accounts 18+ months old", who: { months: 18 }, days: [15, 15], min: 150, max: 150 },
  {
    id: "c23", label: "Accounts 23+ months old in the US, UK, Canada, Australia, Finland, China, Japan, Singapore, Russia and South Africa",
    who: { months: 23, countries: ["United States", "United Kingdom", "Canada", "Australia", "Finland", "China", "Japan", "Singapore", "Russia", "South Africa"] },
    days: [12, 13], min: 100, max: 100,
  },
  {
    id: "c25", label: "Accounts 25+ months old in New Zealand, Switzerland and the Netherlands",
    who: { months: 25, countries: ["New Zealand", "Switzerland", "Netherlands"] },
    days: [13, 13], min: 500, max: 500, every: 2,
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

const monthIndex = (key) => (/^\d{4}-\d{2}$/.test(key) ? Number(key.slice(0, 4)) * 12 + Number(key.slice(5)) - 1 : null);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * The month (year * 12 + month) `perk` can next be used in: `now`'s, unless it or another
 * perk on any of the same days was used less than that perk's `every` months ago.
 */
const nextUseMonth = (perk, used, now) => Math.max(now.getUTCFullYear() * 12 + now.getUTCMonth(), ...FREE_WITHDRAWAL_PERKS
  .filter((p) => monthIndex(used[p.id]) !== null && p.days[0] <= perk.days[1] && perk.days[0] <= p.days[1])
  .map((p) => monthIndex(used[p.id]) + (p.every || 1)));

const usedRecently = (perk, used, now) => nextUseMonth(perk, used, now) > now.getUTCFullYear() * 12 + now.getUTCMonth();

/**
 * The perk that makes a USDT withdrawal of `amount` free right now, or null: one the
 * account qualifies for, on its days, in its range, not used yet this month.
 */
export function freeWithdrawalPerk({ createdMs, isAgent, country: where, used = {}, amount, now = new Date() }) {
  const day = now.getUTCDate();
  return FREE_WITHDRAWAL_PERKS.find((p) => day >= p.days[0] && day <= p.days[1] && amount >= p.min && amount <= p.max
    && !usedRecently(p, used, now) && qualifiesFor(p, { createdMs, isAgent, country: where, now })) || null;
}

/**
 * The perks an account qualifies for (for showing them). `usedRecently`: not free again yet;
 * `nextMonth`: the month it is ("December").
 */
export const freeWithdrawalPerksFor = ({ createdMs, isAgent, country: where, used = {}, now = new Date() }) =>
  FREE_WITHDRAWAL_PERKS.filter((p) => qualifiesFor(p, { createdMs, isAgent, country: where, now }))
    .map((p) => ({ ...p, usedRecently: usedRecently(p, used, now), nextMonth: MONTHS[nextUseMonth(p, used, now) % 12] }));

/** "the 15th", "the 5th–10th". */
export const perkDays = (p) => {
  const th = (n) => `${n}${[, "st", "nd", "rd"][(n % 100 >> 3) ^ 1 && n % 10] || "th"}`;
  return p.days[0] === p.days[1] ? `the ${th(p.days[0])}` : `the ${th(p.days[0])}–${th(p.days[1])}`;
};

/** "on the 15th of each month", "on the 13th every two months". */
export const perkSchedule = (p) => `on ${perkDays(p)} ${(p.every || 1) > 1 ? `every ${p.every === 2 ? "two" : p.every} months` : "of each month"}`;
