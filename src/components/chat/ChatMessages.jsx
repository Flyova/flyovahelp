"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, CornerUpLeft, Flag, MessageCircle, Pencil, Trash2, UserRound } from "lucide-react";
import MessageBubble, { isDeleted, messageMillis, startsRun } from "@/components/chat/MessageBubble";
import MessageMenu from "@/components/chat/MessageMenu";

const NEAR_BOTTOM = 120; // px from the bottom that still counts as "reading the latest"

const dayKey = (m) => {
  const ms = messageMillis(m);
  return ms ? new Date(ms).toDateString() : "pending";
};

/** "Today", "Yesterday", "Monday", "21 October" or "21 October 2025". */
function dayLabel(m) {
  const ms = messageMillis(m);
  if (!ms) return "Today";
  const d = new Date(ms);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  if (today - d < 6 * 24 * 3600 * 1000) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { day: "numeric", month: "long", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
}

/** Messages split into day sections, so each date pill sticks only while its day is on screen. */
function byDay(messages) {
  const days = [];
  for (const m of messages) {
    const key = dayKey(m);
    if (days[days.length - 1]?.key !== key) days.push({ key, label: dayLabel(m), items: [] });
    days[days.length - 1].items.push(m);
  }
  return days;
}

/**
 * Telegram-style message list: date pills that stick while you scroll, grouped
 * bubbles, new messages popping in, a "jump to latest" button with a count of
 * messages that arrived while you were scrolled up, and a popup menu per message.
 *
 * Messages are oldest-first. Mark a message `fresh` to animate it in, `pending`
 * while its write hasn't reached the server. Handlers left out hide their menu item.
 */
export default function ChatMessages({
  messages,
  isMine,
  showAvatars = false,
  showNames = false,
  loading = false,
  emptyText = "No messages yet.",
  onReply,
  onEdit,
  onDelete,
  canDelete = () => true,
  deleteLabel = () => "Delete",
  onReport,
  onMessagePrivately,
  onOpenProfile,
}) {
  const listRef = useRef(null);
  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [seenCount, setSeenCount] = useState(0);
  const [menu, setMenu] = useState(null); // { message, at: { x, y } }
  const [flashId, setFlashId] = useState(null);

  const scrollToBottom = useCallback((smooth) => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Follow new messages while you're at the bottom, and jump down when you've just sent one.
  const lastId = messages[messages.length - 1]?.id;
  const lastMine = messages.length ? isMine(messages[messages.length - 1]) : false;
  const prevLastId = useRef(null);
  useEffect(() => {
    const justSent = lastMine && lastId !== prevLastId.current;
    prevLastId.current = lastId;
    if (atBottomRef.current || justSent) scrollToBottom(messages.length > 1);
  }, [lastId, lastMine, messages.length, scrollToBottom]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    atBottomRef.current = near;
    // Leaving the bottom: everything so far counts as seen; later arrivals are "new".
    if (near || atBottom) setSeenCount(messages.length);
    if (near !== atBottom) setAtBottom(near);
  };
  const unread = atBottom ? 0 : Math.max(0, messages.length - seenCount);

  const jumpTo = (id) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlashId(null);
    requestAnimationFrame(() => setFlashId(id));
    setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1600);
  };

  const menuItems = (m) => {
    const mine = isMine(m);
    return [
      onReply && { label: "Reply", icon: CornerUpLeft, run: () => onReply(m) },
      { label: "Copy text", icon: Copy, run: () => navigator.clipboard?.writeText(m.text).catch(() => {}) },
      mine && onEdit && { label: "Edit", icon: Pencil, run: () => onEdit(m) },
      !mine && onOpenProfile && { label: "View profile", icon: UserRound, run: () => onOpenProfile(m.sender) },
      !mine && onMessagePrivately && { label: "Message privately", icon: MessageCircle, run: () => onMessagePrivately(m.sender) },
      onDelete && canDelete(m) && { label: deleteLabel(m), icon: Trash2, danger: true, run: () => onDelete(m) },
      !mine && onReport && { label: "Report", icon: Flag, danger: true, run: () => onReport(m) },
    ].filter(Boolean);
  };

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={listRef} onScroll={onScroll} className="chat-wallpaper h-full overflow-y-auto overscroll-contain px-2 sm:px-4 md:px-8 pb-3">
        {loading && <p className="text-center text-xs text-white/40 pt-8">Loading messages…</p>}
        {!loading && !messages.length && (
          <div className="h-full flex items-center justify-center">
            <p className="chat-pop text-center text-[13px] text-white/60 bg-black/25 backdrop-blur rounded-2xl px-5 py-3 max-w-xs">{emptyText}</p>
          </div>
        )}

        {byDay(messages).map((day) => (
          <section key={day.key} className="relative">
            <div className="sticky top-2 z-10 flex justify-center pt-3 pb-1 pointer-events-none">
              <span className="px-3 py-1 rounded-full bg-[#0B1220]/85 backdrop-blur text-[12px] font-semibold text-white/85 shadow-[0_2px_10px_rgba(0,0,0,0.35)]">{day.label}</span>
            </div>
            {day.items.map((m, i) => {
              const mine = isMine(m);
              const prev = day.items[i - 1];
              const next = day.items[i + 1];
              return (
                <div key={m.id} id={`msg-${m.id}`} className={`-mx-2 px-2 rounded-xl ${flashId === m.id ? "chat-flash" : ""}`}>
                  <MessageBubble
                    message={m}
                    mine={mine}
                    first={startsRun(prev, m)}
                    last={!next || startsRun(m, next)}
                    showAvatar={showAvatars}
                    showName={showNames}
                    selected={menu?.message.id === m.id}
                    onMenu={isDeleted(m) ? undefined : (msg, at) => setMenu({ message: msg, at })}
                    onReply={onReply}
                    onJumpTo={jumpTo}
                    onOpenProfile={onOpenProfile}
                  />
                </div>
              );
            })}
          </section>
        ))}
      </div>

      {!atBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          aria-label={unread ? `${unread} new messages — jump to latest` : "Jump to latest"}
          className="chat-pop absolute right-3 bottom-3 w-11 h-11 rounded-full bg-[#1E2D4A] border border-white/10 shadow-lg flex items-center justify-center text-white/80 hover:text-white"
        >
          <ChevronDown size={22} />
          {unread > 0 && (
            <span className="absolute -top-1.5 -right-1 min-w-5 h-5 px-1.5 rounded-full bg-[#8B1E3F] text-[11px] font-black flex items-center justify-center">{unread}</span>
          )}
        </button>
      )}

      {menu && <MessageMenu at={menu.at} items={menuItems(menu.message)} onClose={() => setMenu(null)} />}
    </div>
  );
}
