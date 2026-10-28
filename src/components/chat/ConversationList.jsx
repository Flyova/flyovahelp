"use client";
import { useState } from "react";
import { Loader2, MessageCircle, MoreVertical } from "lucide-react";
import Avatar, { DeletedAvatar } from "@/components/Avatar";
import { GroupAvatar } from "@/components/chat/GroupForm";
import MessageMenu from "@/components/chat/MessageMenu";
import { departedFrom, typingLabel } from "@/lib/chat";

const MENU_WIDTH = 228;

/** "14:05" today, "Mon" this week, otherwise "12/10". */
function when(ts) {
  const ms = ts?.toMillis?.();
  if (!ms) return "";
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (now - d < 6 * 24 * 3600 * 1000) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
}

const memberLabel = (n) => `${n} member${n === 1 ? "" : "s"}`;

/**
 * Inbox: one row per private chat or group, newest first. `action` sits beside
 * the title (e.g. a "New group" button); the empty* props fill the empty state,
 * shown once `loading` is over. `typingIn` (id -> usernames) swaps a row's
 * preview for "typing…"; `unread` (id -> count) makes a row bold with a badge;
 * `online` (usernames) puts a green dot on private chats with someone online;
 * `blocked` (usernames) marks private chats with people you've blocked; a
 * closed private chat (the other player deleted their username) reads "Deleted account";
 * `rowMenu(convo)` gives the items for each row's ⋯ menu (archive, delete…).
 */
export default function ConversationList({
  convos,
  myNameIn,
  openId,
  onOpen,
  title = "Your chats",
  action = null,
  emptyTitle = "No chats yet",
  emptyText = "",
  loading = false,
  typingIn = {},
  unread = {},
  online = new Set(),
  blocked = new Set(),
  rowMenu = null,
  className = "",
}) {
  const [menu, setMenu] = useState(null); // { convo, at }

  return (
    <div className={`bg-[#142036] rounded-2xl border border-white/5 flex flex-col min-h-0 ${className}`}>
      <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2 min-h-[44px]">
        <p className="text-[10px] font-black uppercase tracking-wider text-white/40">{title}</p>
        {action}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
        {convos.map((c) => {
          const others = (c.participants || []).filter((p) => p !== myNameIn(c));
          const group = c.type === "group";
          const selected = openId === c.id;
          const typing = typingLabel(typingIn[c.id], group);
          const gone = !group && departedFrom(c, others[0]);
          const isBlocked = !group && !gone && blocked.has(others[0]);
          const count = unread[c.id] || 0;
          return (
            <div key={c.id} className={`flex items-center rounded-xl transition-colors ${selected ? "bg-[#8B1E3F]/25" : "hover:bg-white/[0.04]"}`}>
              <button
                type="button"
                onClick={() => onOpen(c.id)}
                className={`min-w-0 flex-1 flex items-center gap-3 text-left py-2.5 pl-2.5 ${rowMenu ? "pr-1" : "pr-2.5"}`}
              >
                {group ? (
                  <GroupAvatar size={40} rounded="rounded-xl" groupId={c.id} version={c.photoVersion} />
                ) : gone ? (
                  <DeletedAvatar size={40} />
                ) : (
                  <span className="relative shrink-0">
                    <Avatar username={others[0]} size={40} />
                    {online.has(others[0]) && <span className="absolute -right-0.5 -bottom-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 ring-[3px] ring-[#142036]" aria-label="online" />}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`text-[13px] truncate ${count ? "font-black text-white" : "font-bold"}`}>{group ? c.groupName : others.map((p) => `@${p}`).join(", ")}</span>
                    <span className={`shrink-0 text-[10px] ${count ? "text-[#E0708C] font-bold" : "text-white/35"}`}>{when(c.lastMessageAt)}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className={`min-w-0 truncate text-xs ${isBlocked ? "text-red-300/80" : typing ? "text-[#E0708C]" : count ? "text-white/85 font-semibold" : "text-white/45"}`}>
                      {gone ? "Deleted account" : isBlocked ? "Blocked" : typing || c.lastMessage || (group ? memberLabel((c.participants || []).length) : "No messages yet")}
                    </span>
                    {count > 0 && (
                      <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-[#8B1E3F] text-[11px] font-black flex items-center justify-center" aria-label={`${count} unread`}>
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </span>
                </span>
              </button>
              {rowMenu && (
                <button
                  type="button"
                  aria-label={`Options for ${group ? c.groupName : `@${others[0]}`}`}
                  aria-haspopup="menu"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setMenu({ convo: c, at: { x: r.right - MENU_WIDTH, y: r.bottom + 4 } });
                  }}
                  className="shrink-0 w-8 h-10 mr-1 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.06]"
                >
                  <MoreVertical size={16} />
                </button>
              )}
            </div>
          );
        })}

        {!convos.length && loading && (
          <div className="flex justify-center py-8 text-white/40"><Loader2 size={20} className="animate-spin" aria-label="Loading chats" /></div>
        )}

        {!convos.length && !loading && (
          <div className="flex flex-col items-center text-center px-6 py-8 gap-2">
            <span className="w-11 h-11 rounded-2xl bg-white/5 flex items-center justify-center text-white/40"><MessageCircle size={20} /></span>
            <p className="text-sm font-bold text-white/70">{emptyTitle}</p>
            {emptyText && <p className="text-xs text-white/40">{emptyText}</p>}
          </div>
        )}
      </div>

      {menu && <MessageMenu at={menu.at} items={rowMenu(menu.convo)} onClose={() => setMenu(null)} />}
    </div>
  );
}
