import { admin, getAdminDb } from "@/lib/firebaseAdmin";

// Expo Push Service — the mobile app registers an Expo push token on users/{uid}.expoPushToken.
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK = 100; // Expo accepts at most 100 messages per request.

const isExpoToken = (t) => typeof t === "string" && /^Expo(nent)?PushToken\[.+\]$/.test(t);

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
 * @param {Array<{ uid: string, token?: string, data?: object }>|string[]} targets
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
      const u = snap.exists ? snap.data() : {};
      missing[i].token = u.notificationsEnabled === false ? null : u.expoPushToken;
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
      // Muted chats arrive silently (the app's "chat-silent" Android channel has no sound).
      sound: t.silent ? null : "default",
      channelId: t.silent ? "chat-silent" : "default",
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
  const snap = await db.collection("users").where("expoPushToken", ">", "").select("expoPushToken", "notificationsEnabled").get();
  const targets = snap.docs
    .filter((d) => d.get("notificationsEnabled") !== false)
    .map((d) => ({ uid: d.id, token: d.get("expoPushToken") }));
  return sendPushToUsers(targets, message);
}
