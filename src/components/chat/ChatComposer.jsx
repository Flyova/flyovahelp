"use client";
import { useEffect } from "react";
import { Check, Loader2, SendHorizontal } from "lucide-react";
import { ComposerBanner } from "@/components/chat/MessageBubble";

const MAX_HEIGHT = 140;

/**
 * Telegram-style composer: a rounded box that grows with your text, the
 * reply/edit bar sliding in above it, and a round send button that springs in
 * once there's something to send. Enter sends, Shift+Enter adds a line, Escape
 * cancels a reply or edit.
 */
export default function ChatComposer({
  value,
  onChange,
  onSend,
  onCancel,
  mode,
  modeMessage,
  placeholder,
  disabled = false,
  maxLength,
  sending = false,
  inputRef,
}) {
  const ready = !!value.trim() && !disabled;
  const editing = mode === "edit";

  // Shrink back to one line once the text is sent or cleared.
  useEffect(() => {
    if (!value && inputRef?.current) inputRef.current.style.height = "";
  }, [value, inputRef]);

  return (
    <div className="px-3 pt-2 pb-3 border-t border-white/5 bg-[#142036]">
      <ComposerBanner mode={mode} message={modeMessage} onCancel={onCancel} />
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={value}
          rows={1}
          maxLength={maxLength}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            const el = e.target;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (ready) onSend();
            } else if (e.key === "Escape" && mode) onCancel();
          }}
          className="flex-1 min-w-0 resize-none bg-[#0B1220] border border-white/10 focus:border-[#8B1E3F]/80 rounded-[22px] px-4 py-[11px] text-[14.5px] leading-[1.35] outline-none disabled:opacity-50 transition-colors"
          style={{ maxHeight: MAX_HEIGHT }}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!ready || sending}
          aria-label={editing ? "Save edit" : "Send message"}
          className={`shrink-0 w-11 h-11 rounded-full bg-gradient-to-br from-[#A0284D] to-[#6E1732] flex items-center justify-center shadow-[0_6px_18px_-6px_rgba(139,30,63,0.9)] transition-all duration-200 ease-[cubic-bezier(0.2,0.9,0.3,1.4)] ${ready ? "scale-100 opacity-100" : "scale-75 opacity-40"}`}
        >
          {sending ? <Loader2 size={19} className="animate-spin" /> : editing ? <Check size={20} /> : <SendHorizontal size={19} className="translate-x-px" />}
        </button>
      </div>
      {maxLength && value.length > maxLength * 0.8 && (
        <p className="text-[10px] text-white/35 mt-1 text-right pr-14">{value.length}/{maxLength}</p>
      )}
    </div>
  );
}
