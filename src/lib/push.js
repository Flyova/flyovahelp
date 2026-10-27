import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { DEFAULT_TONES, isTone } from "@/lib/chatTones";

// Expo Push Service — the mobile app registers an Expo push token on users/{uid}.expoPushToken.
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK = 100; // Expo accepts at most 100 messages per request.

const isExpoToken = (t) => typeof t === "string" && /^Expo(nent)?PushToken\[.+\]$/.test(t);

// The sound a push plays. Apps from the sound picker on carry every tone (lib/chatTones)
// and write expoPushSoundsToken = their token; those get the tone the player chose.
// Older apps don't have the tones' Android channels, and Android drops a push sent
// to a channel the phone doesn't have, so they keep the phone's default sound.
function soundOf(t) {
  if (t.silent) return { sound: null, channelId: "chat-silent" }; // that channel has no sound
  if (!t.hasTones) return { sound: "default", channelId: "default" };
  const tone = isTone(t.tone) ? t.tone : DEFAULT_TONES.alerts;
  return { sound: `tone_${tone}.wav`, channelId: `tone-${tone}` };
}

// Device details from a users/{uid} doc: its push token (unless notifications are off),
// whether that device's app has the tones, and the account's sound for other notifications.
const deviceOf = (u = {}) => {
  const token = u.notificationsEnabled === false ? null : u.expoPushToken;
  return { token, hasTones: !!token && u.expoPushSoundsToken === token, alertTone: u.notificationTone };
};

async function postToExpo(messages) {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  // Optional: required only if "Enhanced push security" is switched on for the Expo project.
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  const res = await fetch(EXPO_PUSH_URL, { method: "POST", headers, body: JSON.stringify(messages) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Expo push failed (${res.status}): ${JSON.stringify(json.errors || json)}`);
  return Array.isArray(json.data) ? json.data : [];
}

/**
 * Sends one notification to every given user that has a device registered and has not
 * switched notifications off. Tokens Expo reports as dead are cleared so they are not retried.
 *
 * A target's `tone` (a chat profile's sound for that kind of message) wins over the
 * account's sound for other notifications; `silent` sends it without a sound.
 *
 * @param {Array<{ uid: string, token?: string, hasTones?: boolean, tone?: string, silent?: boolean, data?: object }>|string[]} targets
 * @param {{ title: string, body: string, data?: object }} message
 * @returns {Promise<number>} number of tickets Expo accepted
 */
export async function sendPushToUsers(targets, { title, body, data = {} }) {
  const db = getAdminDb();
  const list = targets.map((t) => (typeof t === "string" ? { uid: t } : t)).filter((t) => t?.uid);
  if (!list.length) return 0;

  // Resolve tokens for targets that did not come with one.
  const missing = list.filter((t) => !t.token);
  if (missing.length) {
    const snaps = await db.getAll(...missing.map((t) => db.collection("users").doc(t.uid)));
    snaps.forEach((snap, i) => {
      const { token, hasTones, alertTone } = deviceOf(snap.exists ? snap.data() : {});
      Object.assign(missing[i], { token, hasTones, tone: missing[i].tone || alertTone });
    });
  }

  const seen = new Set();
  const messages = [];
  const owners = [];
  for (const t of list) {
    if (!isExpoToken(t.token) || seen.has(t.token)) continue;
    seen.add(t.token);
    messages.push({
      to: t.token,
      title: t.title || title,
      body: String(body || "").slice(0, 180),
      data: { ...data, ...(t.data || {}) },
      ...soundOf(t),
      priority: "high",
    });
    owners.push(t.uid);
  }

  let accepted = 0;
  for (let i = 0; i < messages.length; i += CHUNK) {
    const batch = messages.slice(i, i + CHUNK);
    let tickets = [];
    try {
      tickets = await postToExpo(batch);
    } catch (e) {
      console.error("Push send error:", e.message);
      continue;
    }
    const dead = [];
    tickets.forEach((ticket, j) => {
      if (ticket?.status === "ok") accepted += 1;
      else if (ticket?.details?.error === "DeviceNotRegistered") dead.push(owners[i + j]);
    });
    await Promise.all(
      dead.map((uid) =>
        db.collection("users").doc(uid)
          .update({ expoPushToken: admin.firestore.FieldValue.delete() })
          .catch(() => null)
      )
    );
  }
  return accepted;
}

/** Pushes to every user with a registered device — used for admin announcements. */
export async function sendPushToAll(message) {
  const db = getAdminDb();
  const snap = await db.collection("users").where("expoPushToken", ">", "")
    .select("expoPushToken", "notificationsEnabled", "expoPushSoundsToken", "notificationTone").get();
  const targets = snap.docs
    .map((d) => {
      const { token, hasTones, alertTone } = deviceOf(d.data());
      return { uid: d.id, token, hasTones, tone: alertTone };
    })
    .filter((t) => t.token);
  return sendPushToUsers(targets, message);
}
