import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { resolvePrivilegedRole } from "@/lib/adminAccess";
import { notify } from "@/lib/moneyEmails";
import { notifySupportReply } from "@/lib/notifications";
import { SUPPORT_PHOTO_LABEL, SUPPORT_PHOTO_MAX_CHARS } from "@/lib/supportPhotos";

// Photos in Live Support. A support chat is support_chats/{uid}: the player's app writes
// its text messages, /api/admin/support-chats the admins' replies. A photo lives in
// support_chats/{uid}/support_images/{id}, which only this route reads and writes (no
// Firestore rule lets players at it), and the chat gets a message carrying its imageId.
//
//   POST { image, caption? }          -> { id }     a player sends a photo (JPEG data URL) to support
//   POST { image, caption?, chatId }  -> { id }     admin/staff/support: a photo in that player's chat
//   GET  ?id=<imageId>[&chat=<uid>]   -> { image }  the photo: the chat's player, or staff for any chat
//
// The daily cleanup (/api/cron/cleanup-chats) deletes chats idle for 7 days with their photos.

const PREFIX = "data:image/jpeg;base64,";
const MAX_PHOTOS = 30; // per chat, until it's cleaned up or an admin deletes some
const MIN_INTERVAL_MS = 3000;
const CHAT_NOTIFY_EMAIL = "contact.notifications.surname@gmail.com";
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const FV = () => admin.firestore.FieldValue;
const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const makeMessageId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

async function isStaff(db, caller) {
  const snap = await db.collection("users").doc(caller.uid).get();
  return !!resolvePrivilegedRole(snap.exists ? snap.data().role : null, caller.email);
}

export async function POST(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const { image, caption, chatId } = await req.json().catch(() => ({}));
    const photo = String(image || "");
    if (!photo.startsWith(PREFIX) || photo.length > SUPPORT_PHOTO_MAX_CHARS || !/^[A-Za-z0-9+/]+=*$/.test(photo.slice(PREFIX.length))) {
      return fail("That photo is too big or not a JPEG.");
    }
    const text = String(caption || "").trim().slice(0, 1000);
    const db = getAdminDb();
    const asStaff = !!chatId && chatId !== caller.uid;
    if (asStaff && !(ID_RE.test(String(chatId)) && (await isStaff(db, caller)))) return fail("Only support can send photos to someone else's chat.", 403);

    const chatRef = db.collection("support_chats").doc(asStaff ? String(chatId) : caller.uid);
    const photos = chatRef.collection("support_images");
    const [chatSnap, count] = await Promise.all([chatRef.get(), photos.count().get()]);
    if (asStaff && !chatSnap.exists) return fail("Chat not found.", 404);
    if (count.data().count >= MAX_PHOTOS) {
      return fail(asStaff ? "This chat holds the most photos it can. Delete some first." : "You've sent the most photos this chat can hold. Please describe the rest in a message.", 429);
    }
    const lastPhotoAt = Number(chatSnap.data()?.userPhotoAt || 0);
    if (!asStaff && Date.now() - lastPhotoAt < MIN_INTERVAL_MS) return fail("Wait a moment before sending another photo.", 429);

    const imageRef = photos.doc();
    const now = FV().serverTimestamp();
    const message = {
      id: makeMessageId(), text, imageId: imageRef.id, senderId: caller.uid,
      senderType: asStaff ? "admin" : "user", timestamp: new Date().toISOString(),
    };
    const batch = db.batch();
    batch.set(imageRef, { data: photo, senderId: caller.uid, senderType: message.senderType, createdAt: now });
    batch.set(chatRef, {
      messages: FV().arrayUnion(message), lastMessage: text || SUPPORT_PHOTO_LABEL, updatedAt: now, resolved: false,
      ...(asStaff
        ? { unreadByUser: true }
        : { userId: caller.uid, userEmail: chatSnap.data()?.userEmail || caller.email || "", unreadByAdmin: true, userPhotoAt: Date.now() }),
    }, { merge: true });
    await batch.commit();

    if (asStaff) {
      await notifySupportReply(db, chatSnap.data()?.userId || String(chatId), text ? `Sent a photo: ${text}` : "Sent you a photo.");
    } else {
      await notify(CHAT_NOTIFY_EMAIL, "Support Notification: New User Photo",
        `<p><strong>Sender:</strong> User (${esc(caller.email)})</p><p><strong>Sent a photo</strong>${text ? `: ${esc(text)}` : ""}</p>`
        + "<p>Open Admin → Support in the StraWins admin panel to see it.</p>");
    }
    return NextResponse.json({ id: imageRef.id });
  } catch (e) {
    console.error("Support photo error:", e);
    return fail(e?.message || "Could not send the photo.", 500);
  }
}

export async function GET(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const params = new URL(req.url).searchParams;
    const id = String(params.get("id") || "");
    const chat = String(params.get("chat") || caller.uid);
    if (!ID_RE.test(id) || !ID_RE.test(chat)) return fail("Photo not found.", 404);
    const db = getAdminDb();
    if (chat !== caller.uid && !(await isStaff(db, caller))) return fail("Photo not found.", 404);
    const snap = await db.collection("support_chats").doc(chat).collection("support_images").doc(id).get();
    if (!snap.exists) return fail("This photo was deleted.", 404);
    // A photo never changes (a new one gets a new id), so the browser may keep it.
    return NextResponse.json({ image: String(snap.data().data || "") }, { headers: { "Cache-Control": "private, max-age=86400" } });
  } catch (e) {
    console.error("Support photo read error:", e);
    return fail("Could not load the photo.", 500);
  }
}
