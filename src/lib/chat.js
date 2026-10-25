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

// Server helper: the usernames/{lower} doc if `uid` owns it (and it is not deleted), else null.
export async function ownedUsername(db, uid, username) {
  const lower = norm(username);
  if (!uid || !isValidUsername(lower)) return null;
  const snap = await db.collection("usernames").doc(lower).get();
  if (!snap.exists) return null;
  const data = snap.data();
  return data.uid === uid && !data.deleted ? { lower, ...data } : null;
}

// Groups belong to one player: `owner` (older groups only have `createdBy`).
// The owner and the usernames in `admins` run the group.
export const MAX_GROUP_MEMBERS = 100;
export const GROUP_NAME_MAX = 60;
export const GROUP_DESCRIPTION_MAX = 200;
export const groupOwner = (convo) => convo?.owner || convo?.createdBy || "";
export const isGroupAdmin = (convo, name) =>
  !!name && (groupOwner(convo) === name || (convo?.admins || []).includes(name));

// What a group search is matched on: lowercase, single spaces, at most 40 characters.
export const groupSearchTerm = (q) => String(q || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 40);

// Every prefix of each word in a public group's name, plus of the whole name (for
// multi-word searches), so one indexed array-contains query finds it.
export function groupSearchKeys(name) {
  const whole = groupSearchTerm(name);
  const keys = new Set();
  const addPrefixes = (s) => {
    for (let i = 1; i <= s.length; i++) keys.add(s.slice(0, i));
  };
  whole.split(/[^\p{L}\p{N}]+/u).filter(Boolean).forEach(addPrefixes);
  addPrefixes(whole);
  return [...keys];
}

// Seen and typing live on the conversation, keyed by username: readAt.<name> (how
// far they've read, only if they share read receipts) and typing.<name>.
export const TYPING_PING_MS = 4000; // a typer refreshes their typing stamp this often
export const TYPING_SHOW_MS = 6500; // "typing…" lasts this long after the last refresh
// Unread counts start here: messages from before seen-tracking existed count as read.
export const READS_SINCE_MS = Date.UTC(2026, 9, 25, 12, 0);

/** "typing…" in a private chat; "@a is typing…", "@a and @b are typing…" or "3 people are typing…" in a group. */
export function typingLabel(names, isGroup) {
  if (!names?.length) return "";
  if (!isGroup) return "typing…";
  if (names.length === 1) return `@${names[0]} is typing…`;
  if (names.length === 2) return `@${names[0]} and @${names[1]} are typing…`;
  return `${names.length} people are typing…`;
}
