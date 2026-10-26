"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, MessageCircle, Radio, Settings, Users } from "lucide-react";
import { authFetch } from "@/lib/authFetch";
import { formatCount } from "@/lib/chat";
import { CHAT_SECTIONS, useChat } from "@/components/chat/ChatProvider";
import { CoinIcon } from "@/components/chat/CoinSheets";

const plural = (n, word) => `${formatCount(n)} ${word}${n === 1 ? "" : "s"}`;

function Choice({ href, icon: Icon, tint, title, text, detail, badge }) {
  return (
    <Link href={href} className="group flex items-center gap-4 bg-[#142036] hover:bg-[#1A2A46] border border-white/5 rounded-[1.75rem] p-4 sm:p-5 transition-colors">
      <span className={`w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center ${tint}`}>
        <Icon size={26} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-lg font-black leading-tight">
          {title}
          {badge > 0 && (
            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#8B1E3F] text-[11px] font-black flex items-center justify-center" aria-label={`${badge} unread`}>{badge}</span>
          )}
        </span>
        <span className="block text-[13px] text-white/55 mt-0.5">{text}</span>
        {detail && <span className="block text-[12px] font-bold text-white/40 mt-1">{detail}</span>}
      </span>
      <ChevronRight size={20} className="shrink-0 text-white/35 group-hover:text-white/70 transition-colors" />
    </Link>
  );
}

/**
 * Chats home: where you choose what to open — the Chatroom, your private chats or
 * your groups — instead of landing straight in a chat. Older /chat?tab=… links
 * still go straight to that page.
 */
export default function ChatsHome() {
  const router = useRouter();
  const { uid, convos, unread, coins, openCoinWallet, chatState, isDeletedForMe } = useChat();
  const [stats, setStats] = useState(null); // Chatroom { members, online }

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (CHAT_SECTIONS.some((s) => s.key === tab)) router.replace(`/chat/${tab}`);
  }, [router]);

  useEffect(() => {
    if (!uid) return;
    authFetch("/api/chat/room").then((r) => !r.error && setStats(r)).catch(() => {});
  }, [uid]);

  const dms = convos.filter((c) => c.type !== "group" && c.lastMessage && !isDeletedForMe(c));
  const groups = convos.filter((c) => c.type === "group");
  const unreadIn = (list) => list.filter((c) => unread[c.id] && !chatState.archived[c.id]).length;

  return (
    <div className="max-w-2xl space-y-3 pb-6">
      <p className="text-[11px] font-black uppercase tracking-wider text-white/45 px-1">Where do you want to chat?</p>
      <Choice
        href="/chat/room"
        icon={Radio}
        tint="bg-[#8B1E3F]/30 text-[#FF8FAB]"
        title="Chatroom"
        text="The general room for every StraWins player."
        detail={stats ? `${plural(stats.members, "member")} · ${formatCount(stats.online)} online` : ""}
      />
      <Choice
        href="/chat/private"
        icon={MessageCircle}
        tint="bg-emerald-500/15 text-emerald-300"
        title="Private chats"
        text="One-to-one chats with other players."
        detail={dms.length ? plural(dms.length, "chat") : "Search for a player to start one"}
        badge={unreadIn(dms)}
      />
      <Choice
        href="/chat/groups"
        icon={Users}
        tint="bg-[#2457D6]/25 text-[#8FB0FF]"
        title="Groups"
        text="Your groups, public groups to join, or start your own."
        detail={groups.length ? plural(groups.length, "group") : "Find or create a group"}
        badge={unreadIn(groups)}
      />

      <div className="grid grid-cols-2 gap-3 pt-1">
        <button type="button" onClick={openCoinWallet} className="flex items-center gap-3 bg-[#142036] hover:bg-[#1A2A46] border border-white/5 rounded-2xl p-3.5 text-left">
          <CoinIcon size={16} />
          <span className="min-w-0">
            <span className="block text-[13px] font-black">Coin wallet</span>
            <span className="block text-[11px] text-white/45 truncate">{formatCount(coins)} coins</span>
          </span>
        </button>
        <Link href="/chat/settings" className="flex items-center gap-3 bg-[#142036] hover:bg-[#1A2A46] border border-white/5 rounded-2xl p-3.5">
          <span className="w-[26px] h-[26px] shrink-0 rounded-full bg-white/10 flex items-center justify-center"><Settings size={15} /></span>
          <span className="min-w-0">
            <span className="block text-[13px] font-black">Chat settings</span>
            <span className="block text-[11px] text-white/45 truncate">Profile, accounts, privacy</span>
          </span>
        </Link>
      </div>
    </div>
  );
}
