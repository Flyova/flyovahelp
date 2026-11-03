// A player's stake range for "Play with friends": users/{uid}.friendsStakeMin and
// friendsStakeMax, whole dollars a round (a stake is always whole dollars, lib/matches),
// either one optional. Challenges to them outside it don't go through: Firestore rules
// refuse making one, /api/game/match refuses accepting one, and no notification is sent.
// Only the server sets the range (/api/game/match "stakeRange"). The app has the same
// helpers (src/lib/stakeRange.ts).

export const MIN_STAKE_PER_ROUND = 1;
export const MAX_STAKE_PER_ROUND = 10000;

const bound = (v) => (Number.isInteger(v) && v >= MIN_STAKE_PER_ROUND && v <= MAX_STAKE_PER_ROUND ? v : null);

/** A users doc's range: { min, max }, each null when not set (or not a usable stake). */
export function stakeRangeOf(u) {
  const min = bound(u?.friendsStakeMin);
  const max = bound(u?.friendsStakeMax);
  return min !== null && max !== null && min > max ? { min: null, max: null } : { min, max };
}

export const hasStakeRange = (r) => r?.min != null || r?.max != null;

/** Whether a stake per round is outside the range. */
export const outsideStakeRange = (r, stake) => (r?.min != null && stake < r.min) || (r?.max != null && stake > r.max);

/** "$5 – $20", "$5 or more", "Up to $20", "Any stake". */
export function stakeRangeText(r) {
  if (r?.min != null && r?.max != null) return r.min === r.max ? `$${r.min}` : `$${r.min} – $${r.max}`;
  if (r?.min != null) return `$${r.min} or more`;
  if (r?.max != null) return `Up to $${r.max}`;
  return "Any stake";
}

/** The stake nearest to `stake` that the range allows. */
export function clampToStakeRange(r, stake) {
  let s = Math.min(MAX_STAKE_PER_ROUND, Math.max(MIN_STAKE_PER_ROUND, Math.floor(Number(stake) || 0)));
  if (r?.min != null) s = Math.max(s, r.min);
  if (r?.max != null) s = Math.min(s, r.max);
  return s;
}

/**
 * A range a player typed: min and max as whole dollars, or empty (null, "") for no
 * bound. Returns { min, max } or { error }.
 */
export function parseStakeRange(min, max) {
  const one = (v, label) => {
    if (v === null || v === undefined || String(v).trim() === "") return { value: null };
    const s = String(v).trim().replace(/^\$/, "");
    if (!/^\d+$/.test(s)) return { error: `The ${label} stake is a whole number of dollars.` };
    const n = Number(s);
    if (n < MIN_STAKE_PER_ROUND || n > MAX_STAKE_PER_ROUND) {
      return { error: `The ${label} stake is between $${MIN_STAKE_PER_ROUND} and $${MAX_STAKE_PER_ROUND.toLocaleString("en-US")} a round.` };
    }
    return { value: n };
  };
  const lo = one(min, "minimum");
  if (lo.error) return lo;
  const hi = one(max, "maximum");
  if (hi.error) return hi;
  if (lo.value !== null && hi.value !== null && lo.value > hi.value) return { error: "The minimum stake can't be more than the maximum." };
  return { min: lo.value, max: hi.value };
}
