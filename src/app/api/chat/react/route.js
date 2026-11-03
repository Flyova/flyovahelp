import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { chatLockRefusal, chatRestrictMessage, isBlockedFromGroup, isReaction, ownedUsername } from "@/lib/chat";

// POST /api/chat/react — your reaction on a message in a group or private chat (not the
// Chatroom), as one of your usernames that's in the chat:
//
//   { convoId, messageId, as, emoji }  -> { reactions }  emoji: one of lib/chat REACTIONS
//                                                        (replaces yours), or null to take it off
//
// Kept on the message as reactions[<username>] = emoji. Only this route writes it (the
// rules don't let clients), and it leaves the chat's last message, unread counts and
// notifications alone. Same limits as sending: not while your Chats are locked or
// restricted, nor as a username its owner's lock covers, nor where you can't send any more.

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const fail = (error, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const { convoId, messageId, as, emoji = null } = await req.json().catch(() => ({}));
    if (emoji !== null && !isReaction(emoji)) return fail("Pick one of the reactions.");
    if (!ID.test(String(convoId || "")) || !ID.test(String(messageId || ""))) return fail("Message not found.", 404);
    const db = getAdminDb();
    const me = await ownedUsername(db, caller.uid, as);
    if (!me) return fail("You can only react as one of your own usernames.", 403);
    const user = (await db.collection("users").doc(caller.uid).get()).data() || {};
    const sanction = chatLockRefusal(user, me) || chatRestrictMessage(user);
    if (sanction) return fail(sanction, 403);

    const convoRef = db.collection("conversations").doc(convoId);
    const msgRef = convoRef.collection("messages").doc(messageId);
    const out = await db.runTransaction(async (tx) => {
      const [c, m] = await tx.getAll(convoRef, msgRef);
      const convo = c.exists ? c.data() : null;
      if (!convo || convo.deleted || (convo.type !== "dm" && convo.type !== "group")) return { error: "Chat not found.", status: 404 };
      if (!(convo.participants || []).includes(me.lower) || !(convo.participantUids || []).includes(caller.uid)
        || isBlockedFromGroup(convo, me.lower)) {
        return { error: "You're not in this chat.", status: 403 };
      }
      if ((convo.blocked || []).includes(me.lower)) return { error: "You can no longer react in this chat.", status: 403 };
      if (convo.closed) return { error: "This player deleted their account. You can't react here.", status: 403 };
      if (!m.exists) return { error: "Message not found.", status: 404 };
      const msg = m.data();
      if (msg.kind === "system" || msg.deletedForEveryone) return { error: "You can't react to this message.", status: 400 };
      const reactions = { ...(msg.reactions || {}) };
      if (emoji) reactions[me.lower] = emoji;
      else delete reactions[me.lower];
      if ((msg.reactions || {})[me.lower] !== reactions[me.lower]) tx.update(msgRef, { reactions });
      return { reactions };
    });
    return out.error ? fail(out.error, out.status) : NextResponse.json({ reactions: out.reactions });
  } catch (e) {
    console.error("Chat reaction error:", e);
    return fail(e?.message || "Could not react.", 500);
  }
}
