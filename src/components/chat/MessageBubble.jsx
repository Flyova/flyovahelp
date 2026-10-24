"use client";
import { useRef, useState } from "react";
import { Ban, Check, Clock3, CornerUpLeft, MoreHorizontal, Pencil } from "lucide-react";
import Avatar from "@/components/Avatar";

const DELETED_TEXT = "— message deleted —";
const SWIPE_REPLY = 56; // px to the left before letting go starts a reply

export const isDeleted = (m) => !!m.deletedForEveryone || m.text === DELETED_TEXT;
export const messageMillis = (m) => m.createdAt?.toMillis?.() ?? m.createdAtMs ?? 0;

export const messageTime = (m) => {
  const ms = messageMillis(m);
  return ms ? new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
};

/** True when `m` starts a new run (different sender, or a gap of 5+ minutes). */
export function startsRun(prev, m) {
  if (!prev || prev.sender !== m.sender) return true;
  return messageMillis(m) - messageMillis(prev) > 5 * 60 * 1000;
}

/** Telegram-style bubble tail, drawn in the bubble's own colour. */
function Tail({ mine, color }) {
  return (
    <svg
      aria-hidden="true"
      width="11"
      height="18"
      viewBox="0 0 11 18"
      className={`absolute bottom-0 ${mine ? "-right-[10px]" : "-left-[10px]"}`}
    >
      <path d={mine ? "M0 0C0 8 3 14 11 18H0Z" : "M11 0C11 8 8 14 0 18H11Z"} fill={color} />
    </svg>
  );
}

/**
 * One chat message, Telegram style: grouped bubbles with a tail on the last one,
 * the time (and a sent tick on your own) tucked into the corner, and a quote of
 * the message it replies to (click it to jump there).
 *
 * Touch: tap for the menu, swipe left to reply. Mouse: right-click or the ⋯
 * button for the menu, double-click to reply.
 */
export default function MessageBubble({
  message: m,
  mine,
  first = true,
  last = true,
  showAvatar = false,
  showName = false,
  selected = false,
  onMenu,
  onReply,
  onJumpTo,
  onOpenProfile,
}) {
  const deleted = isDeleted(m);
  const [dx, setDx] = useState(0);
  const [released, setReleased] = useState(true);
  const drag = useRef(null);
  const lastPointer = useRef("mouse");
  const swallowClick = useRef(false);
  const canSwipe = !!onReply && !deleted;

  const openMenu = (x, y) => !deleted && onMenu?.(m, { x, y });

  const onPointerDown = (e) => {
    lastPointer.current = e.pointerType;
    if (!canSwipe || e.pointerType === "mouse") return;
    drag.current = { x: e.clientX, y: e.clientY, active: false, armed: false };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(my) > 10) drag.current = null; // a scroll, not a swipe
      else if (mx < -8 && Math.abs(mx) > Math.abs(my) * 1.5) {
        d.active = true;
        setReleased(false);
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }
      return;
    }
    const next = Math.max(-90, Math.min(0, mx));
    if (!d.armed && next <= -SWIPE_REPLY) {
      d.armed = true;
      navigator.vibrate?.(8);
    } else if (d.armed && next > -SWIPE_REPLY) d.armed = false;
    setDx(next);
  };
  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    swallowClick.current = true;
    setReleased(true);
    setDx(0);
    if (d.armed) onReply(m);
  };

  const onClick = (e) => {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    if (e.target.closest("[data-no-menu]")) return;
    if (lastPointer.current !== "mouse" || e.detail === 0) openMenu(e.clientX, e.clientY);
  };

  const bg = deleted ? null : mine ? "#6E1732" : "#1E2D4A";
  const bubble = deleted
    ? "bg-black/20 border border-dashed border-white/15 text-white/45"
    : mine
      ? "bg-gradient-to-br from-[#A0284D] to-[#6E1732] text-white"
      : "bg-[#1E2D4A] text-[#F5F3EE]";
  const r = "rounded-[18px]";
  const corners = mine
    ? `${!first ? "rounded-tr-[6px]" : ""} ${last ? "rounded-br-none" : "rounded-br-[6px]"}`
    : `${!first ? "rounded-tl-[6px]" : ""} ${last ? "rounded-bl-none" : "rounded-bl-[6px]"}`;
  const time = messageTime(m);
  const edited = !!m.editedAt && !deleted;
  // Invisible spacer so the text wraps around the time in the corner.
  const spacer = (edited ? 42 : 0) + (mine ? 72 : 56);
  const replyProgress = Math.min(1, -dx / SWIPE_REPLY);

  return (
    // While its menu is open the message is lifted above the blurred backdrop, Telegram style.
    <div className={`group flex items-end gap-2 ${mine ? "justify-end" : "justify-start"} ${first ? "mt-2" : "mt-[3px]"} ${selected ? "relative z-[301]" : ""}`}>
      {showAvatar && !mine &&
        (last ? (
          <button type="button" data-no-menu onClick={() => onOpenProfile?.(m.sender)} aria-label={`View @${m.sender}'s profile`} className="shrink-0 rounded-full transition-transform hover:scale-105">
            <Avatar username={m.sender} size={34} rounded="rounded-full" />
          </button>
        ) : (
          <span className="w-[34px] shrink-0" aria-hidden="true" />
        ))}

      <div
        className={`relative min-w-0 max-w-[min(80%,560px)] flex items-center gap-1.5 ${mine ? "flex-row-reverse mr-[10px]" : "ml-[10px]"}`}
      >
        {/* Swipe-to-reply arrow, revealed as the bubble slides left. */}
        {dx < 0 && (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1/2 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
            style={{ opacity: replyProgress, transform: `translateY(-50%) scale(${0.5 + replyProgress * 0.5})` }}
          >
            <CornerUpLeft size={16} className={replyProgress >= 1 ? "text-[#E0708C]" : "text-white/70"} />
          </span>
        )}

        <div
          role="button"
          tabIndex={-1}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={onClick}
          onDoubleClick={(e) => {
            if (!canSwipe || lastPointer.current !== "mouse" || e.target.closest("[data-no-menu]")) return;
            window.getSelection?.()?.removeAllRanges();
            onReply(m);
          }}
          onContextMenu={(e) => {
            if (deleted) return;
            e.preventDefault();
            openMenu(e.clientX, e.clientY);
          }}
          className={`relative min-w-0 px-3 pt-1.5 pb-1.5 select-text ${r} ${corners} ${bubble} ${canSwipe ? "touch-pan-y" : ""} ${released ? "chat-swipe-release" : ""} ${selected ? "ring-2 ring-[#E0708C]/70 shadow-[0_10px_40px_rgba(0,0,0,0.55)]" : ""} ${m.fresh ? (mine ? "chat-in-mine" : "chat-in-theirs") : ""}`}
          style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        >
          {last && !deleted && <Tail mine={mine} color={bg} />}

          {showName && first && !mine && (
            <button type="button" data-no-menu onClick={() => onOpenProfile?.(m.sender)} className="block max-w-full truncate text-[12.5px] font-bold text-[#E0708C] hover:underline mb-0.5">
              @{String(m.senderName || m.sender).replace(/^@/, "")}
            </button>
          )}

          {m.replyTo && !deleted && (
            <button
              type="button"
              data-no-menu
              onClick={() => onJumpTo?.(m.replyTo.id)}
              className={`block w-full text-left mb-1 mt-0.5 rounded-lg pl-2.5 pr-2 py-1 border-l-[3px] transition-colors ${mine ? "bg-black/20 hover:bg-black/30 border-white/70" : "bg-[#E0708C]/10 hover:bg-[#E0708C]/15 border-[#E0708C]"}`}
            >
              <span className={`block text-[12px] font-bold truncate ${mine ? "text-white" : "text-[#E0708C]"}`}>@{m.replyTo.sender}</span>
              <span className="block text-[12.5px] opacity-75 truncate">{m.replyTo.text}</span>
            </button>
          )}

          {deleted ? (
            <p className="flex items-center gap-1.5 text-[13.5px] italic pr-12">
              <Ban size={13} /> Message deleted
            </p>
          ) : (
            <p className="text-[14.5px] leading-[1.38] whitespace-pre-wrap break-words">
              {m.text}
              <span className="inline-block" style={{ width: spacer }} aria-hidden="true" />
            </p>
          )}

          <span className={`absolute right-2.5 bottom-1 flex items-center gap-0.5 text-[11px] leading-none select-none ${mine && !deleted ? "text-white/65" : "text-white/40"}`}>
            {edited && <span className="mr-1">edited</span>}
            {time}
            {mine && !deleted && (m.pending ? <Clock3 size={12} className="ml-0.5" aria-label="Sending" /> : <Check size={14} className="ml-0.5" aria-label="Sent" />)}
          </span>
        </div>

        {!deleted && onMenu && (
          <button
            type="button"
            data-no-menu
            aria-label="Message options"
            aria-haspopup="menu"
            onClick={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              openMenu(mine ? box.left : box.right, box.bottom);
            }}
            className="hidden md:flex shrink-0 w-7 h-7 rounded-full items-center justify-center text-white/50 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          >
            <MoreHorizontal size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

/** "Replying to…" / "Editing message" bar shown above a composer. */
export function ComposerBanner({ mode, message, onCancel }) {
  if (!mode || !message) return null;
  const editing = mode === "edit";
  return (
    <div key={`${mode}-${message.id}`} className="chat-slide-up flex items-center gap-3 mb-2 rounded-xl bg-black/25 px-3 py-2">
      {editing ? <Pencil size={18} className="text-[#E0708C] shrink-0" /> : <CornerUpLeft size={18} className="text-[#E0708C] shrink-0" />}
      <div className="min-w-0 flex-1 border-l-2 border-[#E0708C] pl-2.5">
        <p className="text-[12px] font-bold text-[#E0708C]">{editing ? "Edit message" : `Reply to @${message.senderName || message.sender}`}</p>
        <p className="text-[12.5px] text-white/60 truncate">{message.text}</p>
      </div>
      <button type="button" onClick={onCancel} aria-label="Cancel" className="w-8 h-8 rounded-full text-white/60 hover:text-white hover:bg-white/10 text-xl leading-none">×</button>
    </div>
  );
}
