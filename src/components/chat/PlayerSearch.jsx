"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Loader2, Search, X } from "lucide-react";
import Avatar from "@/components/Avatar";
import { authFetch } from "@/lib/authFetch";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

const matchNote = (item, query) => {
  if (item.match === "phone") return "Phone number match";
  if (item.match === "referrer") return `Referred by ${query}`;
  return "";
};

/** @username with the typed prefix highlighted. */
function Handle({ username, query }) {
  const q = query.trim().replace(/^@/, "").toLowerCase();
  const n = username.toLowerCase().startsWith(q) ? q.length : 0;
  return (
    <span className="truncate">
      @<span className="text-[#E0708C]">{username.slice(0, n)}</span>{username.slice(n)}
    </span>
  );
}

/**
 * Player search with live suggestions: results appear under the box as you type
 * (username, name, phone, country or referrer). Click a suggestion — or use the
 * arrow keys and Enter — to open a private chat with that player.
 */
export default function PlayerSearch({ onPick }) {
  const [q, setQ] = useState("");
  // Results are tagged with the search they answer, so a slow reply for "adm"
  // never shows under "admin".
  const [found, setFound] = useState({ key: "", items: [] });
  const [failed, setFailed] = useState({ key: "", message: "" });
  const [activeIndex, setActiveIndex] = useState(0);
  const cache = useRef(new Map());

  const term = q.trim().replace(/^@/, "");
  const key = term.toLowerCase();
  const searching = term.length >= MIN_CHARS;
  const items = found.key === key ? found.items : [];
  const status = !searching ? "idle" : found.key === key ? "done" : failed.key === key ? "error" : "loading";

  useEffect(() => {
    if (term.length < MIN_CHARS) return;
    const show = (list) => {
      setFound({ key, items: list });
      setActiveIndex(0);
    };
    const cached = cache.current.get(key);
    const t = setTimeout(async () => {
      if (cached) return show(cached);
      const r = await authFetch(`/api/chat/search?q=${encodeURIComponent(term)}`).catch((e) => ({ error: e.message }));
      if (r.error) return setFailed({ key, message: r.error });
      cache.current.set(key, r.items || []);
      show(r.items || []);
    }, cached ? 0 : DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [term, key]);

  const pick = (item) => {
    if (!item) return;
    onPick(item.usernameLower);
    setQ("");
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") return setQ("");
    if (!searching || !items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(items[activeIndex]);
    }
  };

  const showList = status === "done" || status === "loading";

  return (
    <div className="bg-[#142036] rounded-2xl p-4 border border-white/5">
      <p className="text-[10px] font-black uppercase text-white/40 mb-2">Find a player · username, name, phone, country</p>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showList}
          aria-controls="player-suggestions"
          aria-autocomplete="list"
          aria-activedescendant={showList && items[activeIndex] ? `player-${items[activeIndex].usernameLower}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="Start typing… e.g. john, +44…"
          className="w-full bg-black/40 border border-white/10 focus:border-[#8B1E3F] rounded-xl pl-9 pr-9 py-2.5 text-sm outline-none transition-colors"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10">
            {status === "loading" ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
          </button>
        )}
      </div>

      {status === "error" && <p className="text-xs text-red-300 mt-3">{failed.message}</p>}

      {showList && (
        <ul id="player-suggestions" role="listbox" className="mt-2 -mx-1 max-h-80 overflow-y-auto">
          {items.map((item, i) => {
            const note = matchNote(item, term);
            const detail = [item.fullName, item.country].filter(Boolean).join(" · ");
            return (
              <li key={item.usernameLower} id={`player-${item.usernameLower}`} role="option" aria-selected={i === activeIndex}>
                <button
                  type="button"
                  onClick={() => pick(item)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left transition-colors ${i === activeIndex ? "bg-white/[0.07]" : ""}`}
                >
                  <Avatar username={item.usernameLower} size={34} rounded="rounded-xl" />
                  <span className="min-w-0 flex-1">
                    <span className="flex text-[13px] font-bold text-white"><Handle username={item.username || item.usernameLower} query={term} /></span>
                    {(detail || note) && (
                      <span className="block text-[11px] text-white/45 truncate">{[detail, note].filter(Boolean).join(" · ")}</span>
                    )}
                  </span>
                  <ChevronRight size={16} aria-label="Chat" className={`shrink-0 text-[#E0708C] transition-opacity ${i === activeIndex ? "opacity-100" : "opacity-0"}`} />
                </button>
              </li>
            );
          })}
          {status === "loading" && <li className="px-2 py-3 text-xs text-white/40">Searching…</li>}
          {status === "done" && !items.length && (
            <li className="px-2 py-3 text-xs text-white/40">No players match “{term}”.</li>
          )}
        </ul>
      )}
    </div>
  );
}
