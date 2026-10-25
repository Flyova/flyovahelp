"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { NAV_ITEMS, isNavActive } from "@/components/navItems";

/**
 * Round menu button for pages that hide the header and bottom bar on phones
 * (Chats). Opens the app's navigation in a drawer that slides in from the left;
 * a tap outside, Escape or picking a page closes it.
 */
export default function MobileNavMenu({ className = "" }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const button = buttonRef.current;
    panelRef.current?.querySelector("a")?.focus({ preventScroll: true });
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // the page behind stays put
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      button?.focus({ preventScroll: true });
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`w-10 h-10 rounded-full bg-[#142036] border border-white/10 flex items-center justify-center text-white/85 hover:text-white hover:bg-[#1B2A45] active:scale-95 transition ${className}`}
      >
        <Menu size={19} />
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[350]" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="chat-backdrop absolute inset-0 bg-[#060b14]/60 backdrop-blur-[2px]" onClick={close} />
          <nav
            ref={panelRef}
            className="nav-drawer absolute inset-y-0 left-0 w-[82vw] max-w-[320px] flex flex-col bg-[#0B1220] border-r border-white/10 shadow-[0_0_60px_rgba(0,0,0,0.6)]"
          >
            <div className="shrink-0 h-14 px-4 flex items-center justify-between bg-[#2457D6]">
              <Image src="/logo.png" alt="StraWins" width={100} height={17} />
              <button type="button" onClick={close} aria-label="Close menu" className="w-9 h-9 -mr-1.5 rounded-full flex items-center justify-center text-white hover:bg-black/15">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-1.5">
              {NAV_ITEMS.map(({ name, icon: Icon, path }) => {
                const active = isNavActive(pathname, path);
                return (
                  <Link
                    key={name}
                    href={path}
                    onClick={close}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 outline-none transition-colors ${
                      active
                        ? "bg-[#2457D6] text-[#F5F3EE] shadow-lg shadow-[#2457D6]/20"
                        : "text-[#F5F3EE]/75 hover:bg-[#F5F3EE]/[0.06] focus-visible:bg-[#F5F3EE]/[0.06] hover:text-[#F5F3EE]"
                    }`}
                  >
                    <Icon size={20} />
                    <span className="text-sm font-bold">{name}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>,
        document.body
      )}
    </>
  );
}
