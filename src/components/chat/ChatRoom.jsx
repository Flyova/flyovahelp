"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { authFetch } from "@/lib/authFetch";
import { containsMediaMarker } from "@/lib/chat";
import { resolvePrivilegedRole } from "@/lib/adminAccess";

const MAX_LENGTH = 500;

const timeLabel = (msg) => {
  const ms = msg.createdAt?.toMillis?.() ?? msg.createdAtMs;
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

/**
 * Public chatroom: one room for every signed-in player. Reading is live from
 * Firestore; sending and deleting go through /api/chat/room (rate limits, bans).
 */
export default function ChatRoom({ uid, active, blocked = [], onMessagePrivately, onReport }) {
  const [messages, setMessages] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [menuFor, setMenuFor] = useState(null); // message id whose sender menu is open
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

  const send = async () => {
    setError("");
    const body = text.trim();
    if (!active) return setError("Pick or claim a username before posting.");
    if (!body) return;
    if (body.length > MAX_LENGTH) return setError(`Keep it under ${MAX_LENGTH} characters.`);
    if (containsMediaMarker(body)) return setError("Text only — no images, voice or video.");
    setSending(true);
    const r = await authFetch("/api/chat/room", { method: "POST", body: { action: "send", as: active, text: body } });
    setSending(false);
    if (r.error) return setError(r.error);
    setText("");
  };

  const remove = async (m) => {
    setMenuFor(null);
    const r = await authFetch("/api/chat/room", { method: "POST", body: { action: "delete", id: m.id } });
    if (r.error) setError(r.error);
  };

  return (
    <div className="bg-[#142036] rounded-2xl p-4 border border-white/5 flex flex-col min-h-[60vh] lg:min-h-[calc(100vh-11rem)]">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[10px] font-black uppercase text-white/40 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 sw-live" /> Chatroom · everyone
          </p>
          <p className="text-[11px] text-white/50 mt-0.5">Be kind. Tap a name to message them privately.</p>
        </div>
        <span className="text-[10px] font-black uppercase text-white/40">{active ? `Posting as @${active}` : "No username yet"}</span>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold p-2.5 rounded-xl mb-2">{error}</div>}

      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto max-h-[55vh] lg:max-h-[calc(100vh-19rem)] pr-1 mb-3">
        {!loaded && <p className="text-xs text-white/40">Loading chatroom…</p>}
        {loaded && !visible.length && <p className="text-xs text-white/40">No messages yet — say hello to everyone!</p>}
        {visible.map((m) => {
          const mine = m.senderUid === uid;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <div className={`p-2.5 rounded-xl text-xs max-w-[85%] ${mine ? "bg-[#8B1E3F]" : "bg-black/40"}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  {mine ? (
                    <span className="text-[9px] opacity-70 font-black">You · @{m.sender}</span>
                  ) : (
                    <button onClick={() => setMenuFor(menuFor === m.id ? null : m.id)} className="text-[9px] font-black text-[#E0708C] hover:underline">
                      @{m.senderName || m.sender}
                    </button>
                  )}
                  <span className="text-[9px] opacity-40">{timeLabel(m)}</span>
                </div>
                <p className={`whitespace-pre-wrap break-words ${m.deletedForEveryone ? "opacity-50 italic" : ""}`}>{m.text}</p>
                {!m.deletedForEveryone && (mine || isStaff) && (
                  <button onClick={() => remove(m)} className="text-[9px] opacity-60 underline mt-1">
                    {mine ? "Delete for everyone" : "Remove (staff)"}
                  </button>
                )}
              </div>
              {menuFor === m.id && (
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => { setMenuFor(null); onMessagePrivately?.(m.sender); }}
                    className="text-[10px] bg-[#8B1E3F] px-2.5 py-1 rounded-lg font-black uppercase"
                  >
                    Message privately
                  </button>
                  <button
                    onClick={() => { setMenuFor(null); onReport?.(m); }}
                    className="text-[10px] bg-amber-500/20 text-amber-400 px-2.5 py-1 rounded-lg font-black uppercase"
                  >
                    Report
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 items-end">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder={active ? "Message everyone…" : "Claim a username to post"}
          disabled={!active}
          className="flex-1 resize-none bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={!active || sending || !text.trim()}
          className="bg-[#8B1E3F] px-5 py-2.5 rounded-xl text-xs font-black uppercase disabled:opacity-50"
        >
          {sending ? "…" : "Send"}
        </button>
      </div>
      <p className="text-[10px] text-white/30 mt-1 text-right">{text.length}/{MAX_LENGTH}</p>
    </div>
  );
}
