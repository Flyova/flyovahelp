// Shared chat helpers — text-only, identity = username.
export const USERNAME_RE = /^[a-zA-Z0-9._]{3,30}$/;
export const norm = (u) => String(u || "").trim().toLowerCase();
export const isValidUsername = (u) => USERNAME_RE.test(String(u || "").trim());
export const isValidText = (t) =>
  typeof t === "string" && t.trim().length > 0 && t.trim().length <= 2000;
// Reject image/voice/video payloads: text-only enforcement shared by web + mobile.
export const containsMediaMarker = (t) =>
  /data:(image|audio|video)\/|blob:|https?:\/\/\S+\.(png|jpe?g|gif|webp|mp4|mp3|ogg|wav|mov)(\?\S*)?/i.test(
    String(t || "")
  );
export const dmIdFor = (a, b) => {
  const [x, y] = [norm(a), norm(b)].sort();
  return `dm__${x}__${y}`;
};
export const USERNAME_PRICE = 1;
export const FREE_USERNAMES_OLD_ACCOUNT = 100;
export const FREE_USERNAMES_AGENT = 5;
export const OLD_ACCOUNT_MONTHS = 8;
export function monthsSince(ts) {
  if (!ts) return 0;
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return (Date.now() - d.getTime()) / (30 * 24 * 3600 * 1000);
}
