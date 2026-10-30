import { admin } from "@/lib/firebaseAdmin";
import { sendPushToUsers } from "@/lib/push";
import { notify } from "@/lib/moneyEmails";
import { ADMIN_NOTIFY_EMAIL } from "@/lib/money";

// A player's own notifications, users/{uid}/notifications (read on the website's
// /notifications page and the app's bell; the player can only mark them read), and
// the admins' alerts, admin_notifications (Admin → Alerts).
//
// Types: chat ("group", "message"), trades with agents ("merchant"), friends games and
// rounds ("game"), security and account changes ("account"), and general news
// ("info", "success", "warning"). Admin announcements (broadcasts) use info,
// success, warning and game too.
export const NOTIFICATION_TYPES = ["group", "message", "merchant", "game", "account", "info", "success", "warning"];

const FV = () => admin.firestore.FieldValue;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * Stores a notification for `uid` and pushes it to their phone, unless they switched
 * that type off (users/{uid}.notificationPrefs[type] === false: it's still listed on
 * their notifications page). Never throws: a
 * notification must not undo the money movement it reports. `key` replaces that
 * notification instead of adding one (a chat shows only its latest message).
 */
export async function notifyUser(db, uid, { type = "info", title, body = "", url = "", key, push = true }) {
  if (!uid || !title) return;
  const kind = NOTIFICATION_TYPES.includes(type) ? type : "info";
  try {
    const list = db.collection("users").doc(uid).collection("notifications");
    await (key ? list.doc(key) : list.doc()).set({
      type: kind, title: String(title).slice(0, 120), body: String(body).slice(0, 400), url, read: false,
      createdAt: FV().serverTimestamp(),
    });
    if (push) await sendPushToUsers([uid], { title, body, data: { kind, url }, pref: kind });
  } catch (e) {
    console.error("Notification failed:", e?.message || e);
  }
}

/** notifyUser for several players at once. */
export const notifyUsers = (db, uids, message) => Promise.all([...new Set(uids.filter(Boolean))].map((uid) => notifyUser(db, uid, message)));

/**
 * An alert for the admins: stored for Admin → Alerts, pushed to admin accounts'
 * phones, and (for ones that need a person, like a flagged account) emailed.
 */
export async function alertAdmins(db, { type, title, body = "", uid = "", url = "", email = false }) {
  try {
    await db.collection("admin_notifications").add({
      type, title, body, uid, url, read: false, createdAt: FV().serverTimestamp(),
    });
    const admins = await db.collection("users").where("role", "==", "admin").select().get();
    await Promise.all([
      sendPushToUsers(admins.docs.map((d) => d.id), { title, body, data: { kind: "admin", url: url || "/admin/alerts" } }),
      email && notify(ADMIN_NOTIFY_EMAIL, `[StraWins] ${title}`, `<div style="font-family:Arial,sans-serif;padding:20px;color:#333">
        <h2 style="margin:0 0 12px">${esc(title)}</h2><p>${esc(body)}</p>
        ${uid ? `<p style="color:#777;font-size:12px">User ID: ${esc(uid)}</p>` : ""}
        <p style="color:#777;font-size:12px">Review it in the StraWins admin panel → Alerts.</p></div>`),
    ]);
  } catch (e) {
    console.error("Admin alert failed:", e?.message || e);
  }
}

/**
 * Flags an account for the admins to look at (a badge in Admin → Users until an
 * admin clears it) and alerts them. Flagging doesn't block the player.
 */
export async function flagAccount(db, uid, { reason, title, body }) {
  if (!uid) return;
  try {
    await db.collection("users").doc(uid).update({
      flagged: true, flagReason: reason, flaggedAt: FV().serverTimestamp(), flagCount: FV().increment(1),
    });
  } catch (e) {
    console.error("Flagging failed:", e?.message || e);
  }
  await alertAdmins(db, { type: "flag", title, body, uid, url: `/admin/users?flagged=1`, email: true });
}
