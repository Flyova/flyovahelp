import { CHAT_TONE_KINDS, DEFAULT_TONES, isTone } from "@/lib/chatTones";

// Per-chat-profile settings: chat_settings/{usernameLower}, written only by
// /api/chat/settings (owner or an account logged in to the username). Anything a
// profile hasn't set yet falls back to its owner account's chat_state, where these
// settings lived before they were per profile, then to the defaults below.
export const CHAT_SETTING_DEFAULTS = { readReceipts: true, showOnline: true, hideCountry: false, showCoins: false, allowGroupAdds: true };
// Who can add a profile to a group: anyone running one, admins sending an invite
// it accepts or declines ("ask", the default), or nobody (it joins groups itself).
export const GROUP_ADDS = ["everyone", "ask", "nobody"];

const bool = (...values) => values.find((v) => typeof v === "boolean");

/** Effective settings from a profile's own doc and its owner's chat_state. */
export function effectiveChatSettings(own = {}, account = {}) {
  const out = {};
  for (const [k, def] of Object.entries(CHAT_SETTING_DEFAULTS)) out[k] = bool(own[k], account[k], def);
  // Before invites, this was the switch allowGroupAdds: off still means nobody.
  out.groupAdds = GROUP_ADDS.includes(own.groupAdds) ? own.groupAdds : out.allowGroupAdds === false ? "nobody" : "ask";
  out.allowGroupAdds = out.groupAdds !== "nobody"; // what older apps show
  const o = own.sounds || {};
  const a = account.sounds || {};
  out.sounds = {
    room: bool(o.room, a.room, true),
    private: bool(o.private, a.private, true),
    groups: { ...(a.groups || {}), ...(o.groups || {}) },
    people: { ...(a.people || {}), ...(o.people || {}) },
    // Which sound each kind plays (Chat settings → Notifications → Sounds).
    tones: Object.fromEntries(CHAT_TONE_KINDS.map((k) => [k, isTone(o.tones?.[k]) ? o.tones[k] : DEFAULT_TONES[k]])),
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
