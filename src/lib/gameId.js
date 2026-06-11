// "Flyova to Dollars" round docs are stored as `round_<endTimeMs>`. The raw
// timestamp is too long for display, and slicing its last few decimal digits
// tends to repeat (rounds run on a fixed schedule, so timestamps are often
// multiples of the same interval). Encoding the timestamp in base36 keeps it
// short while staying unique and varied across rounds.
export function shortGameId(id) {
  if (!id) return "N/A";
  const match = String(id).match(/(\d+)$/);
  const num = match ? Number(match[1]) : NaN;
  return Number.isFinite(num) ? num.toString(36).toUpperCase() : String(id).slice(-8).toUpperCase();
}
