"use client";
import { useEffect, useRef, useState } from "react";
import { Copy, CornerUpLeft, Flag, MessageCircle, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Avatar from "@/components/Avatar";

const DELETED_TEXT = "— message deleted —";

export const messageTime = (m) => {
  const ms = m.createdAt?.toMillis?.() ?? m.createdAtMs;
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

/**
 * One chat message. All actions (reply, copy, edit, delete, message privately,
 * report) live in an options menu behind the "⋯" button, which shows on hover on
 * desktop and always on touch screens.
 *
 * `first` = first message of a run from this sender: shows the name and avatar.
 * Pass only the handlers that apply; missing handlers hide their menu item.
 */
export default function MessageBubble({
  message: m,
  mine,
  first = true,
  onReply,
  onEdit,
  onDelete,
  onMessagePrivately,
  onReport,
  deleteLabel = "Delete for everyone",
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef(null);
  const deleted = m.deletedForEveryone || m.text === DELETED_TEXT;

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (e.type === "keydown" ? e.key === "Escape" : !menuRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const items = deleted
    ? []
    : [
        onReply && { label: "Reply", icon: CornerUpLeft, run: () => onReply(m) },
        {
          label: copied ? "Copied" : "Copy text",
          icon: Copy,
          keepOpen: true,
          run: async () => {
            await navigator.clipboard?.writeText(m.text).catch(() => {});
            setCopied(true);
            setTimeout(() => { setCopied(false); setOpen(false); }, 700);
          },
        },
        mine && onEdit && { label: "Edit", icon: Pencil, run: () => onEdit(m) },
        onMessagePrivately && !mine && { label: "Message privately", icon: MessageCircle, run: () => onMessagePrivately(m.sender) },
        onDelete && { label: deleteLabel, icon: Trash2, danger: true, run: () => onDelete(m) },
        onReport && !mine && { label: "Report", icon: Flag, danger: true, run: () => onReport(m) },
      ].filter(Boolean);

  const bubble = deleted
    ? "bg-transparent border border-dashed border-white/15 text-white/45 italic"
    : mine
      ? "bg-gradient-to-br from-[#9C2448] to-[#6E1732] text-white shadow-[0_6px_18px_-8px_rgba(139,30,63,0.8)]"
      : "bg-[#1B2A45] border border-white/[0.06] text-[#F5F3EE]";
  const corner = mine ? (first ? "rounded-2xl rounded-tr-md" : "rounded-2xl") : (first ? "rounded-2xl rounded-tl-md" : "rounded-2xl");

  return (
    <div className={`group flex items-start gap-2 ${mine ? "flex-row-reverse" : ""} ${first ? "mt-3" : "mt-0.5"}`}>
      {first ? <Avatar username={m.sender} size={32} rounded="rounded-xl" className="mt-0.5" /> : <span className="w-8 shrink-0" aria-hidden="true" />}

      <div className={`relative min-w-0 max-w-[78%] flex flex-col ${mine ? "items-end" : "items-start"}`}>
        {first && !mine && (
          <span className="text-[11px] font-bold text-[#E0708C] mb-1 px-1 truncate max-w-full">@{m.senderName || m.sender}</span>
        )}

        <div className={`relative px-3.5 py-2 ${corner} ${bubble}`}>
          {m.replyTo && !deleted && (
            <div className={`mb-1.5 rounded-lg px-2.5 py-1.5 border-l-2 ${mine ? "bg-black/20 border-white/50" : "bg-black/25 border-[#E0708C]"}`}>
              <p className="text-[10px] font-bold opacity-80">@{m.replyTo.sender}</p>
              <p className="text-[12px] opacity-75 line-clamp-2 break-words">{m.replyTo.text}</p>
            </div>
          )}
          <p className="text-[14px] leading-snug whitespace-pre-wrap break-words">{deleted ? "Message deleted" : m.text}</p>
          <span className={`block text-right text-[10px] mt-0.5 ${mine && !deleted ? "text-white/60" : "text-white/35"}`}>
            {m.editedAt && !deleted ? "edited · " : ""}{messageTime(m)}
          </span>
        </div>

        {items.length > 0 && (
          <div ref={menuRef} className={`absolute top-1 ${mine ? "-left-9" : "-right-9"}`}>
            <button
              type="button"
              aria-label="Message options"
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className={`w-7 h-7 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition ${open ? "opacity-100 bg-white/10" : "md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"}`}
            >
              <MoreHorizontal size={16} />
            </button>
            {open && (
              <div role="menu" className={`absolute z-30 top-8 ${mine ? "right-0" : "left-0"} min-w-[180px] py-1.5 rounded-xl bg-[#0F1A2E] border border-white/10 shadow-2xl`}>
                {items.map(({ label, icon: Icon, run, danger, keepOpen }) => (
                  <button
                    key={label}
                    role="menuitem"
                    type="button"
                    onClick={() => { run(); if (!keepOpen) setOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] font-semibold hover:bg-white/5 ${danger ? "text-red-300" : "text-white/90"}`}
                  >
                    <Icon size={15} className="shrink-0 opacity-80" />
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
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
    <div className="flex items-center gap-3 mb-2 rounded-xl bg-black/30 border-l-2 border-[#E0708C] px-3 py-2">
      {editing ? <Pencil size={15} className="text-[#E0708C] shrink-0" /> : <CornerUpLeft size={15} className="text-[#E0708C] shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold text-[#E0708C]">{editing ? "Editing message" : `Replying to @${message.senderName || message.sender}`}</p>
        <p className="text-xs text-white/60 truncate">{message.text}</p>
      </div>
      <button type="button" onClick={onCancel} aria-label="Cancel" className="w-7 h-7 rounded-full text-white/60 hover:text-white hover:bg-white/10 text-lg leading-none">×</button>
    </div>
  );
}

/** True when `m` starts a new run (different sender, or a gap of 5+ minutes). */
export function startsRun(prev, m) {
  if (!prev || prev.sender !== m.sender) return true;
  const t = (x) => x.createdAt?.toMillis?.() ?? x.createdAtMs ?? 0;
  return t(m) - t(prev) > 5 * 60 * 1000;
}
