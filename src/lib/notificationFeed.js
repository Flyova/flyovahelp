// What a player lists on their Notifications page: users/{uid}.notificationFeed[kind]
// === false hides that kind there and from the bell's count (missing = shown). Phone
// pushes are a separate setting (notificationPrefs, Settings → Notifications).
// The kinds are lib/notifications' types plus "announcement" (admin broadcasts).
export const FEED_KINDS = [
  ["group", "Group messages", "New messages in your groups"],
  ["message", "Private messages", "New private chat messages"],
  ["merchant", "Agent trades", "Deposits and withdrawals with agents"],
  ["game", "Game updates", "Challenges, match results and game news"],
  ["account", "Account activity", "PIN, bank, username and sign-up changes"],
  ["info", "Info", "General news from StraWins"],
  ["success", "Success", "Money received, deposits approved"],
  ["warning", "Warnings", "Declined payments, locks and important notices"],
  ["announcement", "Announcements", "News posted by the StraWins team"],
];

/** Whether `kind` shows on the Notifications page, given the account's notificationFeed. */
export const shownInFeed = (feed, kind) => feed?.[kind] !== false;

// Announcements are shared by everyone, so which ones a player has read or deleted is
// kept on the device (the dashboard's banners use the same read list).
export const READ_ANNOUNCEMENTS = "read_announcements";
export const DELETED_ANNOUNCEMENTS = "deleted_announcements";

export function storedIds(key) {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || "[]"));
  } catch {
    return new Set();
  }
}

export function storeIds(key, ids) {
  try { localStorage.setItem(key, JSON.stringify([...ids])); } catch {}
}
