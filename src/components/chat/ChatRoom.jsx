"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { authFetch } from "@/lib/authFetch";
import { containsMediaMarker } from "@/lib/chat";
import { resolvePrivilegedRole } from "@/lib/adminAccess";
import { Check, Loader2, SendHorizontal } from "lucide-react";
import MessageBubble, { ComposerBanner, startsRun } from "@/components/chat/MessageBubble";

const MAX_LENGTH = 500;

/**
 * Public chatroom: one room for every signed-in player. Reading is live from
 * Firestore; sending, editing and deleting go through /api/chat/room (rate limits,
 * bans). Every message action lives in the bubble's options menu.
 */
export default function ChatRoom({ uid, active, blocked = [], onMessagePrivately, onReport }) {
  const [messages, setMessages] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const inputRef = useRef(null);
  const [isStaff, setIsStaff] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, "chatroom_messages"), orderBy("createdAt", "desc"), limit(100)),
      (s) => {
        setMessages(s.docs.map((d) => ({ id: d.id, ...d.data() })).reverse());
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

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible.length]);

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
    // Sized to the visible screen (minus header, tabs, identity bar and the phone bottom nav) so the composer never hides.
    <div className="bg-[#142036] rounded-2xl border border-white/5 flex flex-col h-[calc(100dvh-22rem)] min-h-[340px] md:h-[calc(100dvh-19.5rem)] lg:h-[calc(100vh-14.5rem)] lg:min-h-[520px]">
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-white/5">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase text-white/40 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 sw-live" /> Chatroom · everyone
          </p>
          <p className="text-[11px] text-white/50 mt-0.5">Be kind. Tap ⋯ on a message to reply, edit and more.</p>
        </div>
        <span className="hidden sm:block shrink-0 text-[10px] font-black uppercase text-white/40 text-right">{active ? `Posting as @${active}` : "No username yet"}</span>
      </div>

      {error && <div className="mx-3 mt-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold p-2.5 rounded-xl">{error}</div>}

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-3 md:px-8 py-3">
        {!loaded && <p className="text-xs text-white/40">Loading chatroom…</p>}
        {loaded && !visible.length && <p className="text-xs text-white/40">No messages yet — say hello to everyone!</p>}
        {visible.map((m, i) => {
          const mine = m.senderUid === uid;
          return (
            <MessageBubble
              key={m.id}
              message={m}
              mine={mine}
              first={startsRun(visible[i - 1], m)}
              onReply={startReply}
              onEdit={startEdit}
              onDelete={mine || isStaff ? remove : undefined}
              deleteLabel={mine ? "Delete for everyone" : "Remove (staff)"}
              onMessagePrivately={onMessagePrivately}
              onReport={onReport}
            />
          );
        })}
      </div>

      <div className="p-3 border-t border-white/5">
      <ComposerBanner mode={editing ? "edit" : replyTo ? "reply" : null} message={editing ?? replyTo} onCancel={cancelMode} />
      <div className="flex gap-2 items-end">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            } else if (e.key === "Escape" && (replyTo || editing)) {
              cancelMode();
            }
          }}
          rows={1}
          placeholder={active ? "Message everyone…" : "Claim a username to post"}
          disabled={!active}
          className="flex-1 min-w-0 resize-none bg-black/40 border border-white/10 focus:border-[#8B1E3F] rounded-xl px-3.5 py-2.5 text-sm outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={send}
          disabled={!active || sending || !text.trim()}
          aria-label={editing ? "Save edit" : "Send message"}
          className="shrink-0 w-11 h-[42px] rounded-xl bg-[#8B1E3F] flex items-center justify-center disabled:opacity-40 transition-opacity"
        >
          {sending ? <Loader2 size={18} className="animate-spin" /> : editing ? <Check size={18} /> : <SendHorizontal size={18} />}
        </button>
      </div>
      {text.length > MAX_LENGTH * 0.8 && <p className="text-[10px] text-white/35 mt-1 text-right">{text.length}/{MAX_LENGTH}</p>}
      </div>
    </div>
  );
}
