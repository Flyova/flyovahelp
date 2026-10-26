"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, SendHorizontal } from "lucide-react";
import { authFetch } from "@/lib/authFetch";
import Avatar from "@/components/Avatar";
import { ComposerBanner } from "@/components/chat/MessageBubble";

const MAX_HEIGHT = 140;
const MAX_SUGGESTIONS = 6;
const SEARCH_DELAY_MS = 250;

/** The "@name" being typed just before the caret, or null. */
function mentionAt(text, caret) {
  const m = /(^|\s)@([a-zA-Z0-9._]{0,30})$/.exec(text.slice(0, caret));
  return m ? { query: m[2].toLowerCase(), start: caret - m[2].length - 1 } : null;
}

/**
 * Who to suggest for "@query": `people` (the chat's members or recent posters)
 * that start with it, then, if `searchPlayers`, other players from player search.
 */
function useMentionSuggestions(mention, people, searchPlayers) {
  const [found, setFound] = useState({ key: "", items: [] });
  const q = mention?.query ?? null;
  useEffect(() => {
    if (q === null || !searchPlayers || q.length < 2) return;
    const t = setTimeout(async () => {
      const r = await authFetch(`/api/chat/search?q=${encodeURIComponent(q)}`).catch(() => ({}));
      setFound({ key: q, items: (r.items || []).map((x) => x.usernameLower) });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [q, searchPlayers]);
  if (q === null) return [];
  const local = people.filter((p) => p.startsWith(q));
  const remote = found.key === q ? found.items.filter((p) => !local.includes(p)) : [];
  return [...local, ...remote].slice(0, MAX_SUGGESTIONS);
}

/**
 * Telegram-style composer: a rounded box that grows with your text, the
 * reply/edit bar sliding in above it, and a round send button that springs in
 * once there's something to send. Enter sends, Shift+Enter adds a line, Escape
 * cancels a reply or edit. Text is 16px on phones: any smaller and iOS Safari
 * zooms the page in when the box is tapped.
 *
 * Typing "@" suggests people to mention: `mentionPeople` (usernames in the chat)
 * first, then, with `searchPlayers`, any player.
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
  mentionPeople = [],
  searchPlayers = false,
}) {
  const ready = !!value.trim() && !disabled;
  const editing = mode === "edit";
  const [caret, setCaret] = useState(0);
  const [picked, setPicked] = useState(0); // highlighted suggestion
  const ownRef = useRef(null);
  const box = inputRef || ownRef;
  const mention = mentionAt(value, caret);
  const suggestions = useMentionSuggestions(mention, mentionPeople, searchPlayers);
  const showSuggestions = !disabled && suggestions.length > 0;

  const insertMention = (name) => {
    if (!mention) return;
    const next = `${value.slice(0, mention.start)}@${name} ${value.slice(caret)}`;
    onChange(next);
    const at = mention.start + name.length + 2;
    setCaret(at);
    setPicked(0);
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(at, at);
    });
  };

  // Shrink back to one line once the text is sent or cleared.
  useEffect(() => {
    if (!value && box.current) box.current.style.height = "";
  }, [value, box]);

  return (
    <div className="relative px-3 pt-2 pb-3 border-t border-white/5 bg-[#142036]">
      {showSuggestions && (
        <ul className="chat-slide-up absolute left-3 right-3 bottom-full mb-2 z-20 rounded-2xl bg-[#17243C] border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.5)] overflow-hidden" role="listbox" aria-label="Mention someone">
          {suggestions.map((name, i) => (
            <li key={name}>
              <button
                type="button"
                role="option"
                aria-selected={i === picked}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertMention(name)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left ${i === picked ? "bg-white/[0.07]" : "hover:bg-white/[0.05]"}`}
              >
                <Avatar username={name} size={28} rounded="rounded-full" />
                <span className="text-[14px] font-semibold truncate">@{name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <ComposerBanner mode={mode} message={modeMessage} onCancel={onCancel} />
      <div className="flex items-end gap-2">
        <textarea
          ref={box}
          value={value}
          rows={1}
          maxLength={maxLength}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
            setPicked(0);
            const el = e.target;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onKeyDown={(e) => {
            if (showSuggestions && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault();
              setPicked((p) => (p + (e.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length);
              return;
            }
            if (showSuggestions && (e.key === "Enter" || e.key === "Tab") && !e.shiftKey) {
              e.preventDefault();
              insertMention(suggestions[Math.min(picked, suggestions.length - 1)]);
              return;
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (ready) onSend();
            } else if (e.key === "Escape" && mode) onCancel();
          }}
          className="flex-1 min-w-0 resize-none bg-[#0B1220] border border-white/10 focus:border-[#8B1E3F]/80 rounded-[22px] px-4 py-[11px] text-base md:text-[14.5px] leading-[1.35] outline-none disabled:opacity-50 transition-colors"
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
