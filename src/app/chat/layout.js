"use client";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { CHAT_SECTIONS, ChatProvider, LAST_SECTION_KEY, useChat } from "@/components/chat/ChatProvider";

/** Chats: three pages (Chatroom, Private, Groups) under one header and tab bar. */
export default function ChatLayout({ children }) {
  return (
    <ChatProvider>
      <ChatShell>{children}</ChatShell>
    </ChatProvider>
  );
}

function ChatShell({ children }) {
  const pathname = usePathname();
  const { openIds, err, setErr } = useChat();
  const section = pathname.split("/")[2] || "";
  // On phones an open private chat or group takes the whole screen (its back button returns to the list).
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
    <div className={`min-h-screen w-full bg-[#0B1220] text-white px-4 sm:px-6 md:px-8 ${inThread ? "pt-3 pb-20 md:pb-4 lg:pt-8 lg:pb-8" : "pt-6 pb-24 md:pt-8 md:pb-8"}`}>
      <div className={inThread ? "hidden lg:block" : ""}>
        <h1 className="text-2xl font-black italic uppercase leading-none">Chats</h1>
        <p className="text-[11px] text-white/45 font-bold mt-1.5 mb-4 uppercase">Text only — no images, voice or video calls.</p>

        <nav className="flex sm:inline-flex w-full sm:w-auto bg-[#142036] border border-white/5 rounded-2xl p-1 mb-4" aria-label="Chats">
          {CHAT_SECTIONS.map(({ key, label }) => (
            <Link
              key={key}
              href={`/chat/${key}`}
              aria-current={section === key ? "page" : undefined}
              className={`flex-1 sm:flex-none text-center px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition ${section === key ? "bg-[#8B1E3F] text-white" : "text-white/50 hover:text-white"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>

      {err && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-bold p-3 rounded-xl mb-3">
          <span className="flex-1 break-words">{err}</span>
          <button type="button" onClick={() => setErr("")} aria-label="Dismiss" className="shrink-0 text-red-300/70 hover:text-red-200"><X size={14} /></button>
        </div>
      )}

      {children}
    </div>
  );
}
