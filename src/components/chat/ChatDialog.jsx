"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";

const TONES = {
  danger: "text-[#FF8A9B]",
  primary: "text-[#8FB0FF] font-bold",
  secondary: "text-white/85",
};

/**
 * A small centred dialog with a title, a line of text and stacked choices
 * (like a phone's alert), used instead of the browser's confirm(). `actions`:
 * [{ label, value, tone: "danger" | "primary" | "secondary" }]; Cancel is added
 * at the bottom. `onDone(value)` gets the chosen value, or null for Cancel.
 */
export default function ChatDialog({ title, message, actions, onDone }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onDone(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDone]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-6" role="alertdialog" aria-modal="true" aria-label={title}>
      <div className="chat-backdrop absolute inset-0 bg-[#060b14]/60 backdrop-blur-[3px]" onClick={() => onDone(null)} />
      <div className="chat-pop relative w-full max-w-[320px] rounded-[22px] bg-[#17243C] border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.6)] overflow-hidden">
        <div className="px-5 pt-5 pb-4 text-center">
          <h2 className="text-[16px] font-bold leading-snug">{title}</h2>
          {message && <p className="mt-1.5 text-[13px] leading-relaxed text-white/60">{message}</p>}
        </div>
        {[...actions, { label: "Cancel", value: null, tone: "secondary" }].map((a) => (
          <button
            key={a.label}
            type="button"
            autoFocus={a.value === null}
            onClick={() => onDone(a.value)}
            className={`w-full h-12 border-t border-white/[0.08] text-[15px] font-semibold hover:bg-white/[0.04] active:bg-white/[0.07] ${TONES[a.tone || "secondary"]}`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}
