"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Popup in the chat style: a centred card on desktop, a bottom sheet on phones.
 * Escape, the backdrop or the close button calls `onClose`.
 */
export default function ChatSheet({ label, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  const wide = window.matchMedia("(min-width: 640px)").matches;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={label}>
      <div className="chat-backdrop absolute inset-0 bg-[#060b14]/55 backdrop-blur-[3px]" onClick={onClose} />
      <div className={`${wide ? "chat-pop rounded-3xl" : "chat-sheet rounded-t-3xl"} relative w-full sm:w-[420px] max-h-[88vh] overflow-y-auto bg-[#142036] border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.6)]`}>
        {!wide && <span className="absolute left-1/2 top-2 -translate-x-1/2 w-10 h-1 rounded-full bg-white/25" aria-hidden="true" />}
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-10 w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/80">
          <X size={18} />
        </button>
        {children}
      </div>
    </div>,
    document.body
  );
}
