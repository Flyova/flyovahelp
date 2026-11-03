"use client";
import { useState } from "react";
import Avatar from "@/components/Avatar";
import ChatSheet from "@/components/chat/ChatSheet";
import { REACTIONS, reactionGroups } from "@/lib/chat";

// Reactions on messages in groups and private chats (lib/chat REACTIONS, /api/chat/react).

/** The row of reactions on top of a message's menu; `current` is yours (picking it again takes it off). */
export function ReactionPicker({ current, onPick }) {
  return (
    <div className="flex items-center justify-between px-2 pb-1.5 mb-1 border-b border-white/10" aria-label="React">
      {REACTIONS.map((e) => (
        <button
          key={e}
          type="button"
          aria-label={current === e ? `Take off your ${e}` : `React ${e}`}
          aria-pressed={current === e}
          onClick={() => onPick(current === e ? null : e)}
          className={`w-[34px] h-[34px] rounded-full flex items-center justify-center text-[21px] leading-none transition-transform hover:scale-125 focus:scale-125 outline-none ${current === e ? "bg-[#E0708C]/30 ring-1 ring-[#E0708C]/70" : "hover:bg-white/[0.08] focus:bg-white/[0.08]"}`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

/**
 * The reactions under a message: one chip per reaction with its count, yours
 * highlighted. Tapping a chip picks that reaction (or takes yours off) when
 * `onToggle` is given, else shows who reacted; right-click / long-press shows who.
 */
export function ReactionChips({ reactions, me, mine, indent = false, onToggle, onShowWho }) {
  const groups = reactionGroups(reactions);
  if (!groups.length) return null;
  return (
    // `indent`: past the sender's avatar, in a group.
    <div className={`relative -mt-1 mb-0.5 flex flex-wrap gap-1 ${mine ? "justify-end mr-[10px]" : indent ? "ml-[52px]" : "ml-[10px]"}`}>
      {groups.map(({ emoji, names }) => {
        const yours = names.includes(me);
        const who = names.map((n) => (n === me ? "you" : `@${n}`)).join(", ");
        return (
          <button
            key={emoji}
            type="button"
            data-reaction={emoji}
            title={who}
            aria-label={`${emoji} ${names.length}: ${who}${onToggle ? (yours ? ". Tap to take yours off" : ". Tap to react the same") : ""}`}
            onClick={() => (onToggle ? onToggle(yours ? null : emoji) : onShowWho())}
            onContextMenu={(e) => {
              e.preventDefault();
              onShowWho();
            }}
            className={`chat-pop h-[26px] px-2 rounded-full flex items-center gap-1 text-[13px] leading-none border shadow-[0_2px_8px_rgba(0,0,0,0.35)] ${yours ? "bg-[#6E1732] border-[#E0708C]/70 text-white" : "bg-[#17243C] border-white/10 text-white/85 hover:bg-[#1E2D4A]"}`}
          >
            <span className="text-[15px]">{emoji}</span>
            <span className="font-bold tabular-nums">{names.length}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Who reacted to a message, by reaction ("All" first): handy for a vote in a group. */
export function ReactionsSheet({ reactions, me, onOpenProfile, onClose }) {
  const groups = reactionGroups(reactions);
  const [tab, setTab] = useState("all");
  const total = groups.reduce((n, g) => n + g.names.length, 0);
  const rows = groups.flatMap((g) => (tab === "all" || tab === g.emoji ? g.names.map((name) => ({ name, emoji: g.emoji })) : []));
  const tabClass = (on) => `h-9 px-3.5 rounded-full text-[13px] font-bold flex items-center gap-1.5 shrink-0 ${on ? "bg-[#8B1E3F] text-white" : "bg-white/[0.06] text-white/70 hover:bg-white/10"}`;
  return (
    <ChatSheet label="Reactions" onClose={onClose}>
      <div className="p-4 sm:p-5 sm:pt-6">
        <h2 className="hidden sm:block text-[17px] font-bold mb-3">Reactions</h2>
        <div className="flex gap-2 overflow-x-auto pb-1 sm:mr-10" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "all"} onClick={() => setTab("all")} className={tabClass(tab === "all")}>
            All <span className="tabular-nums">{total}</span>
          </button>
          {groups.map((g) => (
            <button key={g.emoji} type="button" role="tab" aria-selected={tab === g.emoji} onClick={() => setTab(g.emoji)} className={tabClass(tab === g.emoji)}>
              <span className="text-[15px]">{g.emoji}</span> <span className="tabular-nums">{g.names.length}</span>
            </button>
          ))}
        </div>
        <ul className="mt-3 space-y-0.5" data-testid="reactions-list">
          {rows.map(({ name, emoji }) => (
            <li key={`${emoji}${name}`}>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenProfile?.(name);
                }}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left hover:bg-white/[0.05]"
              >
                <Avatar username={name} size={36} rounded="rounded-full" />
                <span className="min-w-0 flex-1 text-[14px] font-bold truncate">{name === me ? "You" : `@${name}`}</span>
                <span className="text-[20px]" aria-label={`reacted ${emoji}`}>{emoji}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </ChatSheet>
  );
}
