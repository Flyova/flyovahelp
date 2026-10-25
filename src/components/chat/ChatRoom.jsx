"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { authFetch } from "@/lib/authFetch";
import { containsMediaMarker } from "@/lib/chat";
import { resolvePrivilegedRole } from "@/lib/adminAccess";
import ChatMessages from "@/components/chat/ChatMessages";
import ChatComposer from "@/components/chat/ChatComposer";

const MAX_LENGTH = 500;
const FRESH_MS = 800; // messages that arrived this recently animate in

/**
 * Public chatroom: one room for every signed-in player. Reading is live from
 * Firestore; sending, editing and deleting go through /api/chat/room (rate limits,
 * bans). Tap (or right-click) a message for its menu, swipe left to reply.
 */
export default function ChatRoom({ uid, active, blocked = [], onMessagePrivately, onReport, onOpenProfile, onSendCoins }) {
  const [messages, setMessages] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const inputRef = useRef(null);
  const [isStaff, setIsStaff] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const arrived = new Map(); // id -> when it first arrived after the initial load
    let initial = true;
    return onSnapshot(
      query(collection(db, "chatroom_messages"), orderBy("createdAt", "desc"), limit(100)),
      (s) => {
        const now = Date.now();
        if (!initial) s.docChanges().forEach((c) => c.type === "added" && arrived.set(c.doc.id, now));
        initial = false;
        setMessages(
          s.docs.map((d) => ({ id: d.id, ...d.data(), fresh: now - (arrived.get(d.id) ?? 0) < FRESH_MS })).reverse()
        );
        setLoaded(true);
      },
      (e) => {
        setLoaded(true);
        setError(`Could not load the chatroom: ${e.message}`);
      }
    );
  }, [uid]);

  // Staff can remove anyone's message (the server re-checks the role).
  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, "users", uid))
      .then((s) => setIsStaff(!!resolvePrivilegedRole(s.data()?.role, auth.currentUser?.email)))
      .catch(() => {});
  }, [uid]);

  const visible = useMemo(
    () => messages.filter((m) => !blocked.includes(m.sender)),
    [messages, blocked]
  );

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

  const send = async () => {
    setError("");
    const body = text.trim();
    if (!active) return setError("Pick or claim a username before posting.");
    if (!body) return;
    if (body.length > MAX_LENGTH) return setError(`Keep it under ${MAX_LENGTH} characters.`);
    if (containsMediaMarker(body)) return setError("Text only — no images, voice or video.");
    setSending(true);
    const r = editing
      ? await authFetch("/api/chat/room", { method: "POST", body: { action: "edit", id: editing.id, text: body } })
      : await authFetch("/api/chat/room", { method: "POST", body: { action: "send", as: active, text: body, ...(replyTo ? { replyTo: replyTo.id } : {}) } });
    setSending(false);
    if (r.error) return setError(r.error);
    setText("");
    setReplyTo(null);
    setEditing(null);
  };

  const remove = async (m) => {
    const r = await authFetch("/api/chat/room", { method: "POST", body: { action: "delete", id: m.id } });
    if (r.error) setError(r.error);
  };

  return (
    // Sized to the visible screen (minus the app header from md up, the Chats title, tabs and identity bar) so the composer never hides.
    <div className="bg-[#142036] rounded-2xl border border-white/5 overflow-hidden flex flex-col h-[calc(100dvh-14rem)] min-h-[340px] md:h-[calc(100dvh-19.5rem)] lg:h-[calc(100vh-14.5rem)] lg:min-h-[520px]">
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-white/5">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase text-white/40 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 sw-live" /> Chatroom · everyone
          </p>
          <p className="text-[11px] text-white/50 mt-0.5">Be kind. Tap a message for options, swipe left to reply.</p>
        </div>
        <span className="hidden sm:block shrink-0 text-[10px] font-black uppercase text-white/40 text-right">{active ? `Posting as @${active}` : "No username yet"}</span>
      </div>

      {error && <div className="mx-3 mt-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold p-2.5 rounded-xl">{error}</div>}

      <ChatMessages
        messages={visible}
        isMine={(m) => m.senderUid === uid}
        showAvatars
        showNames
        loading={!loaded}
        emptyText="No messages yet — say hello to everyone!"
        onReply={startReply}
        onEdit={startEdit}
        onDelete={remove}
        canDelete={(m) => m.senderUid === uid || isStaff}
        deleteLabel={(m) => (m.senderUid === uid ? "Delete for everyone" : "Remove (staff)")}
        onMessagePrivately={onMessagePrivately}
        onReport={onReport}
        onOpenProfile={onOpenProfile}
        onSendCoins={onSendCoins}
      />

      <ChatComposer
        value={text}
        onChange={setText}
        onSend={send}
        onCancel={cancelMode}
        mode={editing ? "edit" : replyTo ? "reply" : null}
        modeMessage={editing ?? replyTo}
        placeholder={active ? "Message everyone…" : "Claim a username to post"}
        disabled={!active}
        maxLength={MAX_LENGTH}
        sending={sending}
        inputRef={inputRef}
      />
    </div>
  );
}
