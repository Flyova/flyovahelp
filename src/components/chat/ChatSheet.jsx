"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, X } from "lucide-react";

/**
 * Popup in the chat style: a centred card on desktop, a full page on phones
 * (with a back arrow and `label` as its title). Escape, the backdrop, the close
 * button or the back arrow calls `onClose`.
 */
export default function ChatSheet({ label, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The page underneath doesn't scroll while a full-page panel is open on a phone.
  useEffect(() => {
    if (window.matchMedia("(min-width: 640px)").matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (typeof document === "undefined") return null;
  const wide = window.matchMedia("(min-width: 640px)").matches;

  if (!wide) {
    return createPortal(
      <div className="chat-sheet fixed inset-0 z-[300] bg-[#0B1220] flex flex-col" role="dialog" aria-modal="true" aria-label={label}>
        <div className="shrink-0 flex items-center gap-2 px-2 h-14 border-b border-white/5 bg-[#0F1A2E]" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <button type="button" onClick={onClose} aria-label="Back" className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/[0.06]">
            <ArrowLeft size={22} />
          </button>
          <h2 className="min-w-0 flex-1 text-[17px] font-bold truncate">{label}</h2>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">{children}</div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center" role="dialog" aria-modal="true" aria-label={label}>
      <div className="chat-backdrop absolute inset-0 bg-[#060b14]/55 backdrop-blur-[3px]" onClick={onClose} />
      <div className="chat-pop rounded-3xl relative w-[420px] max-h-[88vh] overflow-y-auto bg-[#142036] border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-10 w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/80">
          <X size={18} />
        </button>
        {children}
      </div>
    </div>,
    document.body
  );
}
