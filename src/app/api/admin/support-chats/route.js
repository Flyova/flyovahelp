import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { resolvePrivilegedRole } from "@/lib/adminAccess";

export const runtime = "nodejs";

const ADMIN_ROLES = new Set(["admin", "staff", "support"]);

const parseBearerToken = (headerValue) => {
  const raw = String(headerValue || "").trim();
  if (!raw.toLowerCase().startsWith("bearer ")) return "";
  return raw.slice(7).trim();
};

const getAuthorizedRequester = async (request) => {
  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) {
    return { error: "Missing authorization token.", status: 401 };
  }

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch {
    return { error: "Invalid or expired authorization token.", status: 401 };
  }

  const adminDb = getAdminDb();
  const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
  const userData = userSnap.exists ? userSnap.data() : {};
  const role = resolvePrivilegedRole(userData?.role, decoded.email);

  if (!role || !ADMIN_ROLES.has(role)) {
    return { error: "Administrative access required.", status: 403 };
  }

  return {
    adminDb,
    uid: decoded.uid,
    role,
    email: decoded.email || "",
  };
};

const makeMessageId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

const normalizeIsoTime = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  return null;
};

const serializeChat = (docSnap) => {
  const data = docSnap.data() || {};
  const rawMessages = Array.isArray(data.messages) ? data.messages : [];
  return {
    id: docSnap.id,
    userId: data.userId || docSnap.id,
    userEmail: data.userEmail || "Unknown user",
    lastMessage: data.lastMessage || "",
    unreadByAdmin: data.unreadByAdmin === true,
    unreadByUser: data.unreadByUser === true,
    resolved: data.resolved === true,
    updatedAt: normalizeIsoTime(data.updatedAt),
    resolvedAt: normalizeIsoTime(data.resolvedAt),
    messages: rawMessages.map((message) => ({
      id: message?.id || null,
      text: String(message?.text || ""),
      senderId: String(message?.senderId || ""),
      senderType: String(message?.senderType || "user"),
      timestamp: normalizeIsoTime(message?.timestamp) || new Date().toISOString(),
    })),
  };
};

export async function GET(request) {
  try {
    const requester = await getAuthorizedRequester(request);
    if (requester.error) {
      return NextResponse.json({ error: requester.error }, { status: requester.status });
    }

    const chatsSnap = await requester.adminDb
      .collection("support_chats")
      .orderBy("updatedAt", "desc")
      .limit(250)
      .get();

    const chats = chatsSnap.docs.map(serializeChat);
    return NextResponse.json({ chats });
  } catch (error) {
    console.error("Support Chats Fetch Error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not load support chats." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const requester = await getAuthorizedRequester(request);
    if (requester.error) {
      return NextResponse.json({ error: requester.error }, { status: requester.status });
    }

    const payload = await request.json().catch(() => ({}));
    const action = String(payload.action || "").trim();
    const chatId = String(payload.chatId || "").trim();

    if (!action || !chatId) {
      return NextResponse.json(
        { error: "Action and chatId are required." },
        { status: 400 }
      );
    }

    const chatRef = requester.adminDb.collection("support_chats").doc(chatId);
    const chatSnap = await chatRef.get();
    if (!chatSnap.exists) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }

    if (action === "mark_read") {
      await chatRef.update({ unreadByAdmin: false });
      return NextResponse.json({ ok: true });
    }

    if (action === "mark_resolved") {
      await chatRef.update({
        resolved: true,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        messages: admin.firestore.FieldValue.arrayUnion({
          id: makeMessageId(),
          text: "Support marked this chat as resolved. Send a new message to reopen it.",
          senderId: "system",
          senderType: "system",
          timestamp: new Date().toISOString(),
        }),
        lastMessage: "Ticket resolved by support",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        unreadByAdmin: false,
        unreadByUser: true,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "reply") {
      const text = String(payload.message || "").trim();
      if (!text) {
        return NextResponse.json({ error: "Reply message is required." }, { status: 400 });
      }

      await chatRef.update({
        messages: admin.firestore.FieldValue.arrayUnion({
          id: makeMessageId(),
          text,
          senderId: requester.uid,
          senderType: "admin",
          timestamp: new Date().toISOString(),
        }),
        lastMessage: text,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        resolved: false,
        unreadByUser: true,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "delete_message") {
      // Support chat messages live as entries in a single array field (no
      // subcollection with its own doc IDs), so "delete for everyone" means
      // filtering the target entry out of that array. Scoped deliberately to
      // support_chats only — this never touches any other chat/message
      // feature (e.g. in-game match chat) in the app.
      const messageId = String(payload.messageId || "").trim();
      const targetTimestamp = String(payload.timestamp || "").trim();
      const targetSenderId = String(payload.senderId || "").trim();
      const targetText = typeof payload.text === "string" ? payload.text : "";

      if (!messageId && !(targetTimestamp && targetSenderId)) {
        return NextResponse.json({ error: "Message identifier is required." }, { status: 400 });
      }

      const currentMessages = Array.isArray(chatSnap.data()?.messages) ? chatSnap.data().messages : [];
      const matchesTarget = (message) => {
        if (messageId) return message?.id === messageId;
        return (
          String(message?.timestamp || "") === targetTimestamp &&
          String(message?.senderId || "") === targetSenderId &&
          String(message?.text || "") === targetText
        );
      };

      const nextMessages = currentMessages.filter((message) => !matchesTarget(message));
      if (nextMessages.length === currentMessages.length) {
        return NextResponse.json({ error: "Message not found." }, { status: 404 });
      }

      const lastMessage = nextMessages.length > 0 ? nextMessages[nextMessages.length - 1].text : "";
      await chatRef.update({
        messages: nextMessages,
        lastMessage,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    console.error("Support Chats Action Error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not update support chat." },
      { status: 500 }
    );
  }
}
