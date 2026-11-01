// Today, this week (from Monday), this month and this year, for the totals pages
// (inflow earnings, agents' trades, a player's activity). They're the player's own
// days: the page sends its time zone as `tz`, Date#getTimezoneOffset() minutes.

export const PERIODS = ["day", "week", "month", "year"];
export const PERIOD_LABELS = { day: "Today", week: "This week", month: "This month", year: "This year" };

/** The `tz` to send from this browser. */
export const myTz = () => new Date().getTimezoneOffset();

const DAY_MS = 24 * 60 * 60 * 1000;

/** The `tz` query parameter as minutes, within real time zones (UTC when missing). */
export function tzOffset(params) {
  const n = Math.round(Number(params?.get?.("tz")));
  return Number.isFinite(n) ? Math.min(840, Math.max(-840, n)) : 0;
}

/** { day, week, month, year }: when each period started, in ms. */
export function periodStarts(tz = 0, now = Date.now()) {
  // Shifted so the UTC getters read the player's wall clock.
  const local = new Date(now - tz * 60000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const shift = tz * 60000;
  const day = Date.UTC(y, m, local.getUTCDate()) + shift;
  return {
    day,
    week: day - ((local.getUTCDay() + 6) % 7) * DAY_MS,
    month: Date.UTC(y, m, 1) + shift,
    year: Date.UTC(y, 0, 1) + shift,
  };
}

/** One `make()` per period: { day: make(), week: make(), month: make(), year: make() }. */
export const perPeriod = (make) => Object.fromEntries(PERIODS.map((p) => [p, make()]));

/** The periods that time `at` (ms) falls in. */
export const periodsOf = (at, starts) => (at > 0 ? PERIODS.filter((p) => at >= starts[p]) : []);

/** A Firestore Timestamp, Date or ms as ms (0 if none). */
export const msOf = (v) => (typeof v === "number" ? v : v?.toMillis?.() || v?.getTime?.() || 0);
