// The sounds players pick from (Chat settings → Notifications → Sounds). Each is a
// file: public/sounds/tones/tone_<id>.wav here; the app carries its own copy and
// the same file as a notification sound (Android channel "tone-<id>"), so a push
// plays the sound the player chose. Keep this list the same as the app's.
export const TONES = [
  { id: "strawins", label: "StraWins" },
  { id: "chaching", label: "Cha-ching" },
  { id: "pop", label: "Pop" },
  { id: "chime", label: "Chime" },
  { id: "ping", label: "Ping" },
  { id: "marimba", label: "Marimba" },
  { id: "bell", label: "Bell" },
  { id: "arcade", label: "Arcade" },
  { id: "droplet", label: "Droplet" },
  { id: "dingdong", label: "Ding-dong" },
  { id: "jackpot", label: "Jackpot" },
  { id: "bubbles", label: "Bubbles" },
];

export const isTone = (id) => TONES.some((t) => t.id === id);
export const toneLabel = (id) => TONES.find((t) => t.id === id)?.label || "StraWins";

// What each kind of sound plays until a chat profile picks another; "alerts" is the
// account's other notifications (deposits, withdrawals, announcements).
export const DEFAULT_TONES = { private: "strawins", groups: "strawins", room: "strawins", coins: "chaching", alerts: "strawins" };
export const CHAT_TONE_KINDS = ["private", "groups", "room", "coins"];
// How Chat settings names each kind, and what it plays for.
export const CHAT_TONE_TITLES = {
  private: { title: "Private chats", what: "new private messages" },
  groups: { title: "Groups", what: "new messages in your groups" },
  room: { title: "Chatroom", what: "new messages in the Chatroom" },
  coins: { title: "Coins", what: "coins sent in your chats" },
};
/** A chat profile's sounds until it picks others: { private, groups, room, coins }. */
export const defaultChatTones = () => Object.fromEntries(CHAT_TONE_KINDS.map((k) => [k, DEFAULT_TONES[k]]));
