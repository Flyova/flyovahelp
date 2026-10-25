"use client";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Coins, X } from "lucide-react";
import { formatCoins } from "@/lib/chat";
import { CHAT_SECTIONS, ChatProvider, LAST_SECTION_KEY, useChat } from "@/components/chat/ChatProvider";
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
  const { openIds, err, setErr, convos, unread, coins, openCoinWallet } = useChat();
  const section = pathname.split("/")[2] || "";
  // Chats with unread messages, badged on their tab.
  const unreadChats = {
    private: convos.filter((c) => c.type !== "group" && unread[c.id]).length,
    groups: convos.filter((c) => c.type === "group" && unread[c.id]).length,
  };
  // On phones an open private chat or group fills the screen edge to edge (its back button returns to the list).
  const inThread = !!openIds[section];

  // /chat reopens the page you used last.
  useEffect(() => {
    if (!CHAT_SECTIONS.some((s) => s.key === section)) return;
    try {
      localStorage.setItem(LAST_SECTION_KEY, section);
    } catch {
      // Storage blocked (private mode): /chat just opens the chatroom.
    }
  }, [section]);

  return (
    <div className={`min-h-screen w-full bg-[#0B1220] text-white md:px-8 ${inThread ? "md:pt-3 md:pb-4 lg:pt-8 lg:pb-8" : "px-4 sm:px-6 pt-6 pb-6 md:pt-8 md:pb-8"}`}>
      <div className={inThread ? "hidden lg:block" : ""}>
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
            <MobileNavMenu className="md:hidden" />
          </div>
        </div>

        <nav className="flex sm:inline-flex w-full sm:w-auto bg-[#142036] border border-white/5 rounded-2xl p-1 mb-4" aria-label="Chats">
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
        </nav>
      </div>

      {err && (
        <div className={`flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-bold p-3 rounded-xl mb-3 ${inThread ? "max-md:m-3" : ""}`}>
          <span className="flex-1 break-words">{err}</span>
          <button type="button" onClick={() => setErr("")} aria-label="Dismiss" className="shrink-0 text-red-300/70 hover:text-red-200"><X size={14} /></button>
        </div>
      )}

      {children}
    </div>
  );
}
