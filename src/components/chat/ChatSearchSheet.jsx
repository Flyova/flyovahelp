"use client";
import { useState } from "react";
import { collection, getDocs, limit, orderBy, query, startAfter } from "firebase/firestore";
import { History, Loader2, Search } from "lucide-react";
import { db } from "@/lib/firebase";
import { formatCount, presenceOf } from "@/lib/chat";
import Avatar from "@/components/Avatar";
import ChatSheet from "@/components/chat/ChatSheet";
import { isDeleted, messageMillis } from "@/components/chat/MessageBubble";

const MIN_QUERY = 2;
const MAX_RESULTS = 60;
const OLDER_PAGE = 500;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "Today 14:05", "Mon 09:12" or "12 Oct 2026". */
function when(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Today ${time}`;
  if (now - d < 6 * 86400e3) return `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

/** `text` with every match of `q` highlighted. */
function Highlight({ text, q }) {
  const parts = String(text || "").split(new RegExp(`(${escapeRe(q)})`, "ig"));
  return parts.map((p, i) => (i % 2 ? <mark key={i} className="bg-[#E0708C]/35 text-white rounded px-0.5">{p}</mark> : p));
}

/**
 * Search inside a chat: its members (groups; in the Chatroom, the people posting)
 * and its messages. Messages already on screen are searched at once; "Search older
 * messages" reads further back. Tapping a message on screen jumps to it
 * (`onJump(id)`); a person opens their profile. `convoId` "room" = the Chatroom.
 */
export default function ChatSearchSheet({ convoId, title, isGroup, members, me, presence = {}, presenceNow, messages, clearedMs = 0, peopleLabel = "Members", onJump, onOpenProfile, onClose }) {
  const [q, setQ] = useState("");
  const [older, setOlder] = useState({ items: [], loading: false, done: false });
  const term = q.trim().toLowerCase();
  const nameTerm = term.replace(/^@/, "");

  const onScreen = new Set(messages.map((m) => m.id));
  const pool = [...messages, ...older.items];
  const hits = term.length >= MIN_QUERY
    ? pool
      .filter((m) => m.kind !== "system" && !isDeleted(m) && String(m.text || "").toLowerCase().includes(term))
      .sort((a, b) => messageMillis(b) - messageMillis(a))
      .slice(0, MAX_RESULTS)
    : [];
  const memberHits = isGroup
    ? members
      .filter((p) => p.includes(nameTerm))
      .sort((a, b) => Number(!!presenceOf(presence[b], presenceNow)?.online) - Number(!!presenceOf(presence[a], presenceNow)?.online) || a.localeCompare(b))
    : [];

  // One more page of messages from before the oldest one we have.
  const loadOlder = async () => {
    const oldest = pool.reduce((min, m) => (m.createdAt && (!min || messageMillis(m) < messageMillis(min)) ? m : min), null);
    if (!oldest) return setOlder((o) => ({ ...o, done: true }));
    setOlder((o) => ({ ...o, loading: true }));
    try {
      const snap = await getDocs(query(
        convoId === "room" ? collection(db, "chatroom_messages") : collection(db, "conversations", convoId, "messages"),
        orderBy("createdAt", "desc"),
        startAfter(oldest.createdAt),
        limit(OLDER_PAGE)
      ));
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((m) => !clearedMs || messageMillis(m) > clearedMs);
      setOlder((o) => ({ items: [...o.items, ...items], loading: false, done: snap.size < OLDER_PAGE }));
    } catch {
      setOlder((o) => ({ ...o, loading: false, done: true }));
    }
  };

  return (
    <ChatSheet label="Search" onClose={onClose}>
      <div className="p-4 sm:p-5 sm:pt-7">
        <label className="flex items-center gap-2.5 h-11 px-3.5 rounded-xl bg-white/[0.07] focus-within:bg-white/[0.1] sm:mr-10">
          <Search size={18} className="shrink-0 text-white/50" />
          <input
            // Focusing on open makes iPhone Safari shift the full-page panel; on phones you tap the box.
            autoFocus={typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            placeholder={isGroup ? `Search messages and members in ${title}` : `Search messages with ${title}`}
            aria-label="Words to search for"
            className="min-w-0 flex-1 bg-transparent text-base md:text-[15px] outline-none placeholder:text-white/45 [&::-webkit-search-cancel-button]:hidden"
          />
        </label>

        {term.length >= MIN_QUERY && (
          <section className="mt-4">
            <p className="text-[13px] font-semibold text-white/50 px-1 mb-1">Messages{hits.length ? ` · ${hits.length === MAX_RESULTS ? `${MAX_RESULTS}+` : hits.length}` : ""}</p>
            {!hits.length && <p className="px-1 py-3 text-[13px] text-white/45">No messages with “{q.trim()}”{older.done ? "" : " in the recent messages"}.</p>}
            <ul className="-mx-2">
              {hits.map((m) => {
                const visible = onScreen.has(m.id);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      disabled={!visible}
                      onClick={() => onJump(m.id)}
                      className="w-full flex items-start gap-3 px-2 py-2.5 rounded-xl text-left hover:bg-white/[0.05] disabled:hover:bg-transparent"
                    >
                      <Avatar username={m.sender} size={34} rounded="rounded-full" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-[13px] font-bold truncate">{m.sender === me ? "You" : `@${m.sender}`}</span>
                          <span className="shrink-0 text-[11px] text-white/40">{when(messageMillis(m))}</span>
                        </span>
                        <span className="block text-[13.5px] text-white/80 leading-snug break-words line-clamp-3"><Highlight text={m.text} q={q.trim()} /></span>
                        {!visible && <span className="block text-[11px] text-white/35 mt-0.5">Older message</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {!older.done && (
              <button
                type="button"
                onClick={loadOlder}
                disabled={older.loading}
                className="mt-1 w-full h-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-[13px] font-bold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {older.loading ? <Loader2 size={15} className="animate-spin" /> : <History size={15} />} Search older messages
              </button>
            )}
          </section>
        )}

        {isGroup && (memberHits.length > 0 || !nameTerm) && (
          <section className="mt-5">
            <p className="text-[13px] font-semibold text-white/50 px-1 mb-1">{peopleLabel} · {formatCount(memberHits.length)}{nameTerm ? "" : ` of ${formatCount(members.length)}`}</p>
            <ul className="-mx-2">
              {memberHits.map((p) => {
                const st = presenceOf(presence[p], presenceNow);
                return (
                  <li key={p}>
                    <button type="button" onClick={() => onOpenProfile?.(p)} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left hover:bg-white/[0.05]">
                      <span className="relative shrink-0">
                        <Avatar username={p} size={36} rounded="rounded-full" />
                        {st?.online && <span className="absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-[#0B1220]" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold truncate">@{p}{p === me ? " (you)" : ""}</span>
                        {st && <span className={`block text-[11px] ${st.online ? "text-emerald-400" : "text-white/45"}`}>{st.text}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {!isGroup && term.length < MIN_QUERY && <p className="mt-4 px-1 text-[13px] text-white/45">Type at least two letters to search this chat.</p>}
      </div>
    </ChatSheet>
  );
}
