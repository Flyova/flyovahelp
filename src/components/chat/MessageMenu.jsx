"use client";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const WIDTH = 228;
const ROW = 42;

/**
 * Telegram-style context menu: the chat dims and blurs, and the menu springs open
 * from the point you tapped or right-clicked (kept inside the screen). Arrow keys
 * move between items, Enter picks, Escape or a tap outside closes.
 * `items`: [{ label, icon, run, danger? }]
 */
export default function MessageMenu({ at, items, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    menuRef.current?.querySelector("[role=menuitem]")?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const all = [...(menuRef.current?.querySelectorAll("[role=menuitem]") || [])];
      const i = all.indexOf(document.activeElement);
      all[(i + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length]?.focus();
    };
    const close = () => onClose();
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const height = items.length * ROW + 12;
  const left = Math.max(8, Math.min(at.x, vw - WIDTH - 8));
  const openUp = at.y + height > vh - 12;
  const top = Math.max(8, openUp ? at.y - height : at.y);
  const origin = `${at.x - left}px ${openUp ? "100%" : "0"}`;

  // Three layers: backdrop (300) < the lifted message (301, set by the bubble) < this menu (302).
  return createPortal(
    <>
      <div
        className="chat-backdrop fixed inset-0 z-[300] bg-[#060b14]/45 backdrop-blur-[3px]"
        onClick={onClose}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div
        ref={menuRef}
        role="menu"
        onContextMenu={(e) => e.preventDefault()}
        className="chat-pop fixed z-[302] py-1.5 rounded-2xl bg-[#17243C]/95 backdrop-blur-xl border border-white/10 shadow-[0_18px_60px_rgba(0,0,0,0.6)]"
        style={{ left, top, width: WIDTH, transformOrigin: origin }}
      >
        {items.map(({ label, icon: Icon, run, danger }) => (
          <button
            key={label}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              run();
            }}
            className={`w-full h-[42px] flex items-center gap-3.5 px-4 text-left text-[14px] font-semibold outline-none hover:bg-white/[0.07] focus:bg-white/[0.07] ${danger ? "text-[#FF8A9B]" : "text-white/90"}`}
          >
            <Icon size={18} className="shrink-0 opacity-80" />
            {label}
          </button>
        ))}
      </div>
    </>,
    document.body
  );
}
