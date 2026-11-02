"use client";
import { useState } from "react";
import { Pin, X } from "lucide-react";

/**
 * A group's (or the Chatroom's) pinned messages, in a bar under the header (WhatsApp style):
 * one at a time, newest first. Tapping it jumps to that message and moves on to
 * the next pin. `pins` = [{ id, sender, text }]; `onUnpin(pin)` (admins) adds an
 * unpin button.
 */
export default function PinnedBar({ pins, onJump, onUnpin }) {
  const [index, setIndex] = useState(0);
  if (!pins.length) return null;
  const at = index % pins.length;
  const pin = pins[at];
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-[#0F1A2E]">
      {pins.length > 1 && (
        <span className="flex flex-col gap-0.5 self-stretch py-0.5" aria-hidden="true">
          {pins.map((p, i) => <span key={p.id} className={`flex-1 w-[3px] rounded-full ${i === at ? "bg-[#E0708C]" : "bg-white/15"}`} />)}
        </span>
      )}
      <button
        type="button"
        onClick={() => {
          onJump(pin.id);
          setIndex(at + 1);
        }}
        aria-label={`Pinned message ${at + 1} of ${pins.length}: go to it`}
        className="min-w-0 flex-1 flex items-center gap-2 text-left"
      >
        <Pin size={15} className="shrink-0 text-[#E0708C] rotate-45" />
        <span className="min-w-0">
          <span className="block text-[11px] font-black uppercase tracking-wide text-[#E0708C]">
            Pinned message{pins.length > 1 ? ` ${at + 1}/${pins.length}` : ""}
          </span>
          <span className="block text-[13px] text-white/80 truncate">
            {pin.sender ? <b className="font-bold">@{pin.sender}: </b> : null}{pin.text}
          </span>
        </span>
      </button>
      {onUnpin && (
        <button
          type="button"
          onClick={() => onUnpin(pin)}
          aria-label="Unpin this message"
          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/5"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
