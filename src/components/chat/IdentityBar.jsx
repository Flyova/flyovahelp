"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Link2, UserPlus } from "lucide-react";
import { formatCoins } from "@/lib/chat";
import Avatar from "@/components/Avatar";
import { useChat } from "@/components/chat/ChatProvider";

// Unread chats waiting for a username you're not using right now.
function UnreadBadge({ count, name }) {
  if (!count) return null;
  return (
    <span aria-label={`@${name} has ${count} unread chat${count === 1 ? "" : "s"}`} className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#8B1E3F] text-white text-[10px] font-black flex items-center justify-center">
      {count}
    </span>
  );
}

/**
 * Compact "Chatting as" bar: the usernames already on this account (your own and
 * the ones you've logged in to, marked with a link icon) as chips to switch
 * between, plus a list of them, closed by default. Each username has its own
 * chats, so the others show how many of theirs are unread. Adding, buying or
 * logging in to another username happens in Chat settings, not here.
 */
export default function IdentityBar({ identities, active, onSelect }) {
  const [open, setOpen] = useState(false);
  const { unreadByName = {}, coinsOf } = useChat() || {};

  const pick = (name) => {
    onSelect(name);
    setOpen(false);
  };

  return (
    <div className="bg-[#142036] rounded-2xl border border-white/5">
      <div className="flex items-center gap-2 p-2.5 pl-3.5">
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-white/40">As</span>
        <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {identities.map((i) => {
            const selected = active === i.usernameLower;
            return (
              <button
                key={i.usernameLower}
                type="button"
                onClick={() => onSelect(i.usernameLower)}
                aria-pressed={selected}
                className={`shrink-0 flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-xl text-xs font-bold border transition-colors ${selected ? "bg-[#8B1E3F] border-[#8B1E3F] text-white" : "bg-black/25 border-white/10 text-white/70 hover:text-white"}`}
              >
                <Avatar username={i.usernameLower} size={22} rounded="rounded-lg" />@{i.username}
                {i.linked && <Link2 size={12} className="text-white/60" aria-label="logged in from another account" />}
                {!selected && <UnreadBadge count={unreadByName[i.usernameLower]} name={i.usernameLower} />}
              </button>
            );
          })}
          {!identities.length && <span className="text-xs text-white/40">No chat username yet</span>}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Choose a chat username"
          className={`shrink-0 flex items-center gap-1 h-8 px-2.5 rounded-xl text-[11px] font-black uppercase transition-colors ${open ? "bg-white/10 text-white" : "text-white/60 hover:text-white hover:bg-white/5"}`}
        >
          <span className="hidden sm:inline">Switch</span>
          <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="border-t border-white/5 p-2">
          {identities.length > 0 && (
            <>
              <p className="px-1.5 pt-1 pb-1.5 text-[10px] font-black uppercase text-white/40">Your usernames</p>
              <ul>
                {identities.map((i) => (
                  <li key={i.usernameLower}>
                    <button
                      type="button"
                      onClick={() => pick(i.usernameLower)}
                      className="w-full flex items-center gap-2.5 px-1.5 py-1.5 rounded-xl text-left hover:bg-white/5"
                    >
                      <Avatar username={i.usernameLower} size={28} rounded="rounded-lg" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-bold truncate">@{i.username}</span>
                        <span className="block text-[10.5px] text-white/45">
                          {i.linked ? "Logged in from another account" : i.isDefault ? "Main username" : "Extra username"}
                          {coinsOf && ` · ${formatCoins(coinsOf(i.usernameLower))} coins`}
                        </span>
                      </span>
                      {active === i.usernameLower
                        ? <Check size={16} className="shrink-0 text-[#E0708C]" aria-label="In use" />
                        : <UnreadBadge count={unreadByName[i.usernameLower]} name={i.usernameLower} />}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Link
            href="/chat/settings/accounts"
            className="mt-1 flex items-center gap-2.5 px-1.5 py-2 rounded-xl text-[12px] font-semibold text-[#8FB0FF] hover:bg-white/5"
          >
            <UserPlus size={15} className="shrink-0" /> Add, buy or log in to a username in Chat settings
          </Link>
        </div>
      )}
    </div>
  );
}
