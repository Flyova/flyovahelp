// Per-chat-profile settings: chat_settings/{usernameLower}, written only by
// /api/chat/settings (owner or an account logged in to the username). Anything a
// profile hasn't set yet falls back to its owner account's chat_state, where these
// settings lived before they were per profile, then to the defaults below.
export const CHAT_SETTING_DEFAULTS = { readReceipts: true, showOnline: true, hideCountry: false, showCoins: false };

const bool = (...values) => values.find((v) => typeof v === "boolean");

/** Effective settings from a profile's own doc and its owner's chat_state. */
export function effectiveChatSettings(own = {}, account = {}) {
  const out = {};
  for (const [k, def] of Object.entries(CHAT_SETTING_DEFAULTS)) out[k] = bool(own[k], account[k], def);
  const o = own.sounds || {};
  const a = account.sounds || {};
  out.sounds = {
    room: bool(o.room, a.room, true),
    private: bool(o.private, a.private, true),
    groups: { ...(a.groups || {}), ...(o.groups || {}) },
    people: { ...(a.people || {}), ...(o.people || {}) },
  };
  return out;
}

/** Map usernameLower -> effective settings for `entries` = [{ name, uid }] (uid = the username's owner). */
export async function chatSettingsFor(db, entries) {
  if (!entries.length) return new Map();
  const uids = [...new Set(entries.map((e) => e.uid).filter(Boolean))];
  const [own, accounts] = await Promise.all([
    db.getAll(...entries.map((e) => db.collection("chat_settings").doc(e.name))),
    uids.length ? db.getAll(...uids.map((uid) => db.collection("chat_state").doc(uid))) : [],
  ]);
  const byUid = new Map(accounts.map((s) => [s.id, s.exists ? s.data() : {}]));
  return new Map(entries.map((e, i) => [e.name, effectiveChatSettings(own[i].exists ? own[i].data() : {}, byUid.get(e.uid) || {})]));
}
