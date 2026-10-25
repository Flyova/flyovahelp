"use client";
import { useEffect, useRef, useState } from "react";
import {
  addDoc, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc,
} from "firebase/firestore";
import { ChevronLeft, MoreHorizontal } from "lucide-react";
import { db } from "@/lib/firebase";
import { containsMediaMarker, isValidText } from "@/lib/chat";
import { notifyPush } from "@/lib/pushClient";
import ChatMessages from "@/components/chat/ChatMessages";
import ChatComposer from "@/components/chat/ChatComposer";
import MessageMenu from "@/components/chat/MessageMenu";

const FRESH_MS = 800; // messages that arrived this recently animate in
const MENU_WIDTH = 228;

/**
 * One open private chat or group: header (back, avatar, name, options), the
 * live message list and the composer. Key it by conversation id.
 *
 * `me` is the username you're in this chat as. `header` = { avatar, title,
 * subtitle, label, onClick }. `menuItems` fill the ⋯ menu. A group admin passes
 * `onModerate` to remove other people's messages.
 */
export default function ConversationThread({
  convoId,
  convo,
  me,
  isGroup,
  header,
  menuItems = [],
  onBack,
  onError,
  onModerate,
  onMessagePrivately,
  onReport,
  onOpenProfile,
}) {
  const [msgs, setMsgs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [lost, setLost] = useState(false); // removed from the chat while it was open
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [menuAt, setMenuAt] = useState(null);
  const inputRef = useRef(null);

  // Messages — with metadata changes, so a message shows a clock until the server has it.
  useEffect(() => {
    const arrived = new Map(); // id -> when it first arrived after the initial load
    let initial = true;
    return onSnapshot(
      query(collection(db, "conversations", convoId, "messages"), orderBy("createdAt", "asc"), limit(200)),
      { includeMetadataChanges: true },
      (s) => {
        const now = Date.now();
        if (!initial) s.docChanges().forEach((c) => c.type === "added" && arrived.set(c.doc.id, now));
        initial = false;
        setMsgs(s.docs.map((d) => ({
          id: d.id,
          ...d.data({ serverTimestamps: "estimate" }),
          pending: d.metadata.hasPendingWrites,
          fresh: now - (arrived.get(d.id) ?? 0) < FRESH_MS,
        })));
        setLoaded(true);
      },
      () => {
        setLoaded(true);
        setLost(true);
      }
    );
  }, [convoId]);

  const blockedHere = !!convo?.blocked?.includes(me);
  const cantSend = !convo || blockedHere || lost;

  const send = async () => {
    onError("");
    if (!me || cantSend) return;
    if (!isValidText(text)) return onError("Message required (max 2000 chars).");
    if (containsMediaMarker(text)) return onError("Text only — no images, voice or video.");
    const body = text.trim();
    // Clear the composer right away; put things back if the write fails.
    setText("");
    if (editing) {
      const target = editing;
      setEditing(null);
      await updateDoc(doc(db, "conversations", convoId, "messages", target.id), {
        text: body, editedAt: serverTimestamp(),
      }).catch((e) => {
        setEditing(target);
        setText(body);
        onError(`Could not save the edit: ${e.message}`);
      });
      return;
    }
    const quoted = replyTo;
    const quote = quoted ? { replyTo: { id: quoted.id, sender: quoted.sender, text: String(quoted.text || "").slice(0, 140) } } : {};
    setReplyTo(null);
    let msgRef;
    try {
      msgRef = await addDoc(collection(db, "conversations", convoId, "messages"), {
        sender: me, text: body, createdAt: serverTimestamp(), deletedForEveryone: false, ...quote,
      });
    } catch (e) {
      setReplyTo(quoted);
      setText(body);
      return onError(`Could not send: ${e.message}`);
    }
    await updateDoc(doc(db, "conversations", convoId), {
      lastMessage: body.slice(0, 120), lastMessageAt: serverTimestamp(),
    }).catch(() => null);
    // Fan out minimal notification docs; .catch on each write so one failure can't skip the push.
    const others = (convo.participants || []).filter((p) => p !== me);
    await Promise.all(others.map((p) => addDoc(collection(db, "notifications"), {
      toUsername: p, fromUsername: me, kind: isGroup ? "group" : "dm",
      title: isGroup ? `New message in ${convo.groupName || "your group"}` : `New message from @${me}`,
      body: body.slice(0, 120), convoId, read: false, createdAt: serverTimestamp(),
    }).catch(() => null)));
    notifyPush({ event: "chat_message", convoId, messageId: msgRef.id });
  };

  const startReply = (m) => {
    setEditing(null);
    setReplyTo(m);
    inputRef.current?.focus();
  };
  const startEdit = (m) => {
    setReplyTo(null);
    setEditing(m);
    setText(m.text);
    inputRef.current?.focus();
  };
  const cancelMode = () => {
    if (editing) setText("");
    setReplyTo(null);
    setEditing(null);
  };

  const deleteMessage = async (m) => {
    if (m.sender !== me) return onModerate?.(m);
    await updateDoc(doc(db, "conversations", convoId, "messages", m.id), {
      text: "— message deleted —", deletedForEveryone: true,
    }).catch((e) => onError(`Could not delete: ${e.message}`));
  };

  const openMenu = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenuAt({ x: r.right - MENU_WIDTH, y: r.bottom + 6 });
  };

  const subtitle = lost
    ? "You're no longer in this chat"
    : blockedHere
      ? "You can no longer send messages here"
      : header.subtitle;

  return (
    <>
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/5">
        <button type="button" onClick={onBack} aria-label="Back to the list" className="lg:hidden shrink-0 w-9 h-9 -ml-1 rounded-xl flex items-center justify-center text-white/80 hover:bg-white/5">
          <ChevronLeft size={22} />
        </button>
        <button
          type="button"
          disabled={!convo || !header.onClick}
          onClick={header.onClick}
          aria-label={header.label}
          className="min-w-0 flex-1 flex items-center gap-2.5 text-left rounded-xl -my-1 py-1 pr-2 hover:bg-white/[0.04] transition-colors"
        >
          {header.avatar}
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold truncate">{convo ? header.title : lost ? "Chat unavailable" : "Loading…"}</span>
            <span className={`block text-[12px] truncate ${lost || blockedHere ? "text-red-300/80" : "text-white/45"}`}>{convo || lost ? subtitle : ""}</span>
          </span>
        </button>
        {convo && menuItems.length > 0 && (
          <button
            type="button"
            aria-label="Chat options"
            aria-haspopup="menu"
            aria-expanded={!!menuAt}
            onClick={openMenu}
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white bg-white/5 hover:bg-white/10"
          >
            <MoreHorizontal size={17} />
          </button>
        )}
      </div>

      <ChatMessages
        messages={msgs}
        isMine={(m) => m.sender === me}
        showAvatars={isGroup}
        showNames={isGroup}
        loading={!loaded}
        emptyText={lost ? "This chat isn't available to you any more." : `No messages yet. Say hello${isGroup ? " to the group" : ""}!`}
        onReply={cantSend ? undefined : startReply}
        onEdit={cantSend ? undefined : startEdit}
        onDelete={deleteMessage}
        canDelete={(m) => m.sender === me || !!onModerate}
        deleteLabel={(m) => (m.sender === me ? "Delete for everyone" : "Remove (admin)")}
        onMessagePrivately={onMessagePrivately}
        onReport={onReport}
        onOpenProfile={onOpenProfile}
      />

      <ChatComposer
        value={text}
        onChange={setText}
        onSend={send}
        onCancel={cancelMode}
        mode={editing ? "edit" : replyTo ? "reply" : null}
        modeMessage={editing ?? replyTo}
        placeholder={lost ? "You're no longer in this chat" : blockedHere ? "You can't reply to this chat" : "Message"}
        disabled={cantSend}
        maxLength={2000}
        inputRef={inputRef}
      />

      {menuAt && <MessageMenu at={menuAt} items={menuItems} onClose={() => setMenuAt(null)} />}
    </>
  );
}

/** What the thread pane shows on desktop before a chat is picked. */
export function ThreadPlaceholder({ icon: Icon, title, text }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 px-8">
      <span className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/40"><Icon size={22} /></span>
      <p className="text-sm font-bold text-white/70">{title}</p>
      <p className="text-xs text-white/40 max-w-xs">{text}</p>
    </div>
  );
}
