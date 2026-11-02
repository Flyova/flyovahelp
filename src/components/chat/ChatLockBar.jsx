"use client";
import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import { CHAT_UNLOCK_PRICE } from "@/lib/chat";
import { useChat } from "@/components/chat/ChatProvider";

/**
 * Why sending is locked (lib/chat chatLockRefusal), in place of the message box
 * (`card` for the top of the Chats lists), with "Unlock for $12" when it's your own
 * account that's locked.
 */
export default function ChatLockBar({ text, canUnlock, card = false }) {
  const { unlockChats } = useChat();
  const [busy, setBusy] = useState(false);
  const unlock = async () => {
    setBusy(true);
    await unlockChats();
    setBusy(false);
  };
  return (
    <div data-chat-lock className={card
      ? "mb-4 p-4 rounded-2xl border border-amber-400/25 bg-amber-400/10 flex flex-col sm:flex-row sm:items-center gap-3"
      : "px-4 py-3 border-t border-white/5 bg-[#142036] flex flex-col sm:flex-row sm:items-center gap-3"}>
      <p className={`flex-1 flex items-start gap-2 text-[13px] ${card ? "text-amber-100" : "text-white/60"}`}>
        <LockKeyhole size={14} className="shrink-0 mt-0.5" /> {text}
      </p>
      {canUnlock && (
        <button type="button" onClick={unlock} disabled={busy}
          className="shrink-0 h-9 px-4 rounded-xl bg-gradient-to-br from-[#F6C453] to-[#D18E1F] text-[#2B1800] text-xs font-black uppercase disabled:opacity-60 active:scale-95 transition">
          {busy ? "Unlocking…" : `Unlock for $${CHAT_UNLOCK_PRICE}`}
        </button>
      )}
    </div>
  );
}
