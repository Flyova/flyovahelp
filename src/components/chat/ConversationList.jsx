"use client";
import { useState } from "react";
import { MessageCircle, Plus, Users, X } from "lucide-react";
import Avatar from "@/components/Avatar";

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

/**
 * Inbox: one row per private chat or group, newest first, plus a "New group"
 * button that opens an inline name field. `onCreateGroup(name)` resolves to an
 * error message, or "" on success.
 */
export default function ConversationList({ convos, active, openId, onOpen, onCreateGroup, className = "" }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const create = async () => {
    if (!name.trim()) return;
    if (!(await onCreateGroup(name.trim()))) {
      setName("");
      setCreating(false);
    }
  };

  return (
    <div className={`bg-[#142036] rounded-2xl border border-white/5 flex flex-col min-h-0 ${className}`}>
      <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2">
        <p className="text-[10px] font-black uppercase tracking-wider text-white/40">Your chats</p>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          aria-expanded={creating}
          className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-black uppercase text-[#E0708C] hover:bg-white/5"
        >
          {creating ? <X size={13} /> : <Plus size={13} />} {creating ? "Cancel" : "New group"}
        </button>
      </div>

      {creating && (
        <div className="flex gap-2 px-4 pb-3">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="Group name"
            className="flex-1 min-w-0 bg-black/40 border border-white/10 focus:border-[#8B1E3F] rounded-xl px-3 py-2 text-sm outline-none"
          />
          <button type="button" onClick={create} disabled={!name.trim()} className="shrink-0 bg-[#8B1E3F] px-4 rounded-xl text-xs font-black uppercase disabled:opacity-50">
            Create
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
        {convos.map((c) => {
          const others = (c.participants || []).filter((p) => p !== active);
          const group = c.type === "group";
          const selected = openId === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onOpen(c.id)}
              className={`w-full flex items-center gap-3 text-left px-2.5 py-2.5 rounded-xl transition-colors ${selected ? "bg-[#8B1E3F]/25" : "hover:bg-white/[0.04]"}`}
            >
              {group ? (
                <span className="w-10 h-10 shrink-0 rounded-xl bg-[#2457D6]/25 text-[#8FB0FF] flex items-center justify-center"><Users size={18} /></span>
              ) : (
                <Avatar username={others[0]} size={40} />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-bold truncate">{group ? c.groupName : others.map((p) => `@${p}`).join(", ")}</span>
                  <span className="shrink-0 text-[10px] text-white/35">{when(c.lastMessageAt)}</span>
                </span>
                <span className="block text-xs text-white/45 truncate">{c.lastMessage || (group ? `${(c.participants || []).length} members` : "No messages yet")}</span>
              </span>
            </button>
          );
        })}

        {!convos.length && (
          <div className="flex flex-col items-center text-center px-6 py-8 gap-2">
            <span className="w-11 h-11 rounded-2xl bg-white/5 flex items-center justify-center text-white/40"><MessageCircle size={20} /></span>
            <p className="text-sm font-bold text-white/70">No chats yet</p>
            <p className="text-xs text-white/40">Find a player above to start a private chat, or create a group.</p>
          </div>
        )}
      </div>
    </div>
  );
}
