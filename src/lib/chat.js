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

// Every account that can chat as a username: its owner (`uid`) plus the accounts that
// logged in to it with its password (`linkedUids`).
export const usernameUids = (n) => [...new Set([n?.uid, ...(n?.linkedUids || [])].filter(Boolean))];

// Server helper: the usernames/{lower} doc if `uid` can chat as it — it owns it, or is
// logged in to it — and it isn't deleted, else null. `owned` tells the two apart.
export async function ownedUsername(db, uid, username) {
  const lower = norm(username);
  if (!uid || !isValidUsername(lower)) return null;
  const snap = await db.collection("usernames").doc(lower).get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (data.deleted || !usernameUids(data).includes(uid)) return null;
  return { lower, ...data, owned: data.uid === uid };
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

// Chat coins: one coin is worth $0.10. Buying adds a 7% fee on top; withdrawing coins
// back to the main wallet keeps 12%; sending coins to another player is free.
// Money is worked out in whole cents.
export const COIN_CENTS = 10;
export const COIN_BUY_FEE = 0.07;
export const COIN_WITHDRAW_FEE = 0.12;
export const MAX_COINS_PER_ACTION = 100000; // $10,000 worth
export const isCoinAmount = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_COINS_PER_ACTION;
/** Buying `coins`: { value, fee, total } in cents (total is what the main wallet pays). */
export function coinBuyQuote(coins) {
  const value = coins * COIN_CENTS;
  const fee = Math.round(value * COIN_BUY_FEE);
  return { value, fee, total: value + fee };
}
/** Withdrawing `coins`: { value, fee, payout } in cents (payout goes to the main wallet). */
export function coinWithdrawQuote(coins) {
  const value = coins * COIN_CENTS;
  const fee = Math.round(value * COIN_WITHDRAW_FEE);
  return { value, fee, payout: value - fee };
}
export const formatCents = (cents) => `$${(cents / 100).toFixed(2)}`;
export const formatCount = (n) => Number(n || 0).toLocaleString("en-US");
export const formatCoins = formatCount;

// Server helper: the usernames/{lower} doc for a live (not deleted) username, else null.
export async function liveUsername(db, username) {
  const lower = norm(String(username || "").replace(/^@/, ""));
  if (!isValidUsername(lower)) return null;
  const snap = await db.collection("usernames").doc(lower).get();
  if (!snap.exists || snap.data().deleted || !snap.data().uid) return null;
  return { lower, ...snap.data() };
}

// Online status: chat_presence/<username> = { lastActive, hidden }, refreshed every
// PRESENCE_PING_MS while Chats is open. "Online" = active in the last PRESENCE_ONLINE_MS.
export const PRESENCE_PING_MS = 60000;
export const PRESENCE_ONLINE_MS = 150000;

/** { online, text } for a presence doc at time `now` ("online", "last seen 5 min ago"…), or null if hidden/unknown. */
export function presenceOf(p, now) {
  const ms = p?.lastActive?.toMillis?.();
  if (!ms || !now || p.hidden) return null;
  const ago = now - ms;
  if (ago < PRESENCE_ONLINE_MS) return { online: true, text: "online" };
  if (ago < 3600e3) return { online: false, text: `last seen ${Math.max(1, Math.round(ago / 60000))} min ago` };
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const today = new Date(now);
  const yesterday = new Date(now - 86400e3);
  if (d.toDateString() === today.toDateString()) return { online: false, text: `last seen today at ${time}` };
  if (d.toDateString() === yesterday.toDateString()) return { online: false, text: `last seen yesterday at ${time}` };
  return { online: false, text: `last seen ${d.toLocaleDateString([], { day: "numeric", month: "short" })}` };
}

// Server helper: participantUids for a conversation whose members are `names` — every
// account that can chat as any of them. `getAll` is db.getAll or a transaction's.
export async function participantUidsFor(getAll, db, names) {
  if (!names.length) return [];
  const snaps = await getAll(...names.map((n) => db.collection("usernames").doc(n)));
  return [...new Set(snaps.filter((s) => s.exists && !s.data().deleted).flatMap((s) => usernameUids(s.data())))];
}

/**
 * What the next chat username costs, in dollars (0 = free): the first one is free;
 * accounts 8+ months old get FREE_USERNAMES_OLD_ACCOUNT more free, agents
 * FREE_USERNAMES_AGENT; otherwise USERNAME_PRICE each. `owned` counts usernames
 * the account already has (deleted ones too).
 */
export function usernameCharge({ owned, ageMonths, isAgent, freeUsernameUsed }) {
  const freeQuota = ageMonths >= OLD_ACCOUNT_MONTHS ? FREE_USERNAMES_OLD_ACCOUNT : isAgent ? FREE_USERNAMES_AGENT : 0;
  if (freeQuota > 0) return owned >= 1 + freeQuota ? USERNAME_PRICE : 0;
  return freeUsernameUsed === true || owned >= 1 ? USERNAME_PRICE : 0;
}

/** Wording for the add-a-username button and heading, from what it would cost (null = not known yet). */
export const usernameOffer = (price) => (price > 0
  ? { button: `Buy · $${price}`, title: `Buy a chat username ($${price} from your wallet)` }
  : { button: "Add", title: price === 0 ? "Add a chat username (free)" : "Add a chat username" });
