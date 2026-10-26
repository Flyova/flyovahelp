"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Coins, Settings, X } from "lucide-react";
import { formatCoins } from "@/lib/chat";
import { CHAT_SECTIONS, ChatProvider, useChat } from "@/components/chat/ChatProvider";
import MobileNavMenu from "@/components/MobileNavMenu";

/**
 * Chats: three pages (Chatroom, Private, Groups) under one header and tab bar.
 * Full screen on phones: the app header and bottom bar are hidden, and the round
 * menu button opens the app's navigation instead.
 */
export default function ChatLayout({ children }) {
  return (
    <ChatProvider>
      <ChatShell>{children}</ChatShell>
    </ChatProvider>
  );
}

function ChatShell({ children }) {
  const pathname = usePathname();
  const { openIds, err, setErr, notice, convos, unread, coins, openCoinWallet, chatState } = useChat();
  const section = pathname.split("/")[2] || "";
  // Chats with unread messages, badged on their tab (archived ones don't count).
  const counted = convos.filter((c) => unread[c.id] && !chatState.archived[c.id]);
  const unreadChats = {
    private: counted.filter((c) => c.type !== "group").length,
    groups: counted.filter((c) => c.type === "group").length,
  };
  // On phones an open private chat or group fills the screen edge to edge (its back button returns to the list).
  const inThread = !!openIds[section];
  // A player's full profile (/chat/u/<name>) and Chat settings also get the whole phone screen.
  // Settings pages bring their own back arrow and title.
  const fullPage = inThread || section === "u" || section === "settings";

  return (
    <div className={`min-h-screen w-full bg-[#0B1220] text-white md:px-8 ${inThread ? "md:pt-3 md:pb-4 lg:pt-8 lg:pb-8" : "px-4 sm:px-6 pt-6 pb-6 md:pt-8 md:pb-8"}`}>
      <div className={fullPage ? "hidden lg:block" : ""}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-black italic uppercase leading-none">Chats</h1>
            <p className="text-[11px] text-white/45 font-bold mt-1.5 uppercase">Text only — no images, voice or video calls.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={openCoinWallet}
              aria-label={`Coin wallet: ${formatCoins(coins)} coins`}
              className="h-10 pl-1.5 pr-3.5 rounded-full bg-gradient-to-br from-[#F6C453] to-[#D18E1F] text-[#2B1800] flex items-center gap-1.5 text-sm font-black active:scale-95 transition"
            >
              <span className="w-7 h-7 rounded-full bg-white/35 flex items-center justify-center"><Coins size={15} /></span>
              {formatCoins(coins)}
            </button>
            <Link
              href="/chat/settings"
              aria-label="Chat settings"
              aria-current={section === "settings" ? "page" : undefined}
              className={`w-10 h-10 rounded-full border border-white/10 flex items-center justify-center transition ${section === "settings" ? "bg-[#8B1E3F] text-white" : "bg-[#142036] text-white/85 hover:text-white hover:bg-[#1B2A45]"}`}
            >
              <Settings size={18} />
            </Link>
            <MobileNavMenu className="md:hidden" />
          </div>
        </div>

        {/* The tabs; Chats home (/chat) shows them as big choices instead. */}
        {CHAT_SECTIONS.some((s) => s.key === section) && <nav className="flex sm:inline-flex w-full sm:w-auto bg-[#142036] border border-white/5 rounded-2xl p-1 mb-4" aria-label="Chats">
          {CHAT_SECTIONS.map(({ key, label }) => (
            <Link
              key={key}
              href={`/chat/${key}`}
              aria-current={section === key ? "page" : undefined}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition ${section === key ? "bg-[#8B1E3F] text-white" : "text-white/50 hover:text-white"}`}
            >
              {label}
              {unreadChats[key] > 0 && (
                <span
                  aria-label={`${unreadChats[key]} unread`}
                  className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] tracking-normal flex items-center justify-center ${section === key ? "bg-white text-[#8B1E3F]" : "bg-[#8B1E3F] text-white"}`}
                >
                  {unreadChats[key]}
                </span>
              )}
            </Link>
          ))}
        </nav>}
      </div>

      {err && (
        <div className={`flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-bold p-3 rounded-xl mb-3 ${inThread ? "max-md:m-3" : ""}`}>
          <span className="flex-1 break-words">{err}</span>
          <button type="button" onClick={() => setErr("")} aria-label="Dismiss" className="shrink-0 text-red-300/70 hover:text-red-200"><X size={14} /></button>
        </div>
      )}

      {children}

      {notice && (
        <div role="status" className="chat-pop fixed left-1/2 bottom-6 md:bottom-8 -translate-x-1/2 z-[360] px-4 py-2.5 rounded-2xl bg-[#17243C] border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.5)] text-[13px] font-bold whitespace-nowrap">
          {notice}
        </div>
      )}
    </div>
  );
}
