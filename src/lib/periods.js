// Today, this week (from Monday), this month and this year, for the totals pages
// (inflow earnings, agents' trades, a player's activity), plus a custom range of days
// the player picks (`from` and `to`). They're the player's own days: the page sends
// its time zone as `tz`, Date#getTimezoneOffset() minutes.

export const PERIODS = ["day", "week", "month", "year"];
export const PERIOD_LABELS = { day: "Today", week: "This week", month: "This month", year: "This year", custom: "Custom" };
/** The tabs on the totals pages: the four periods, then "custom". */
export const PERIOD_TABS = [...PERIODS, "custom"];
/** The longest custom range, in days. */
export const MAX_CUSTOM_DAYS = 366;

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

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A YYYY-MM-DD day as ms at 00:00 UTC, or NaN if it isn't a real day. */
function utcDay(s) {
  const m = DAY.exec(String(s || ""));
  if (!m) return NaN;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(ms);
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? ms : NaN;
}

/**
 * The custom range a page asked for with `from` and `to` (YYYY-MM-DD, the player's own
 * days, both included): { start, end, from, to } with start and end in ms (end is the
 * midnight after `to`). null if neither was sent; { error } if they aren't a range.
 */
export function customRange(params, tz = 0, now = Date.now()) {
  const from = params?.get?.("from") || "";
  const to = params?.get?.("to") || from;
  if (!from && !to) return null;
  const f = utcDay(from);
  const t = utcDay(to);
  if (!Number.isFinite(f) || !Number.isFinite(t)) return { error: "Pick a start and an end date." };
  if (f > t) return { error: "The start date is after the end date." };
  if ((t - f) / DAY_MS + 1 > MAX_CUSTOM_DAYS) return { error: `Pick up to ${MAX_CUSTOM_DAYS} days at a time.` };
  const start = f + tz * 60000;
  if (start > now) return { error: "Pick days up to today." };
  return { start, end: t + DAY_MS + tz * 60000, from, to };
}

/** Whether time `at` (ms) is inside custom range `range`. */
export const inRange = (at, range) => at > 0 && at >= range.start && at < range.end;

/** One `make()` per period: { day: make(), week: make(), month: make(), year: make() }, and `custom` with a range. */
export const perPeriod = (make, custom = null) =>
  Object.fromEntries([...PERIODS, ...(custom ? ["custom"] : [])].map((p) => [p, make()]));

/** The periods that time `at` (ms) falls in, with "custom" when it's inside `custom`. */
export const periodsOf = (at, starts, custom = null) =>
  at > 0 ? [...PERIODS.filter((p) => at >= starts[p]), ...(custom && inRange(at, custom) ? ["custom"] : [])] : [];

/** A Firestore Timestamp, Date or ms as ms (0 if none). */
export const msOf = (v) => (typeof v === "number" ? v : v?.toMillis?.() || v?.getTime?.() || 0);

/* ── In the browser and the app: picking a custom range ─────────────── */

const pad = (n) => String(n).padStart(2, "0");
/** A Date as the YYYY-MM-DD of its local day. */
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Ready-made ranges for the custom tab: { key, label, range: () => ({ from, to }) }. */
export const CUSTOM_PRESETS = [
  { key: "yesterday", label: "Yesterday", range: (now = new Date()) => { const y = ymd(addDays(now, -1)); return { from: y, to: y }; } },
  {
    key: "lastWeek", label: "Last week",
    range: (now = new Date()) => {
      const monday = addDays(now, -((now.getDay() + 6) % 7));
      return { from: ymd(addDays(monday, -7)), to: ymd(addDays(monday, -1)) };
    },
  },
  {
    key: "lastMonth", label: "Last month",
    range: (now = new Date()) => ({
      from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)),
    }),
  },
  { key: "last30", label: "Last 30 days", range: (now = new Date()) => ({ from: ymd(addDays(now, -29)), to: ymd(now) }) },
  {
    key: "lastYear", label: "Last year",
    range: (now = new Date()) => ({ from: `${now.getFullYear() - 1}-01-01`, to: `${now.getFullYear() - 1}-12-31` }),
  },
];

/** "1 Oct – 31 Oct 2026", "5 Nov 2026": a from/to range for a heading. */
export function rangeLabel({ from, to }) {
  const show = (s, withYear) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", ...(withYear && { year: "numeric" }) });
  };
  if (from === to) return show(from, true);
  return `${show(from, from.slice(0, 4) !== to.slice(0, 4))} – ${show(to, true)}`;
}

/** The `&from=&to=` to add to a totals request. */
export const rangeQuery = ({ from, to }) => `&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
