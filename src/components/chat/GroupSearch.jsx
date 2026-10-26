"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { authFetch } from "@/lib/authFetch";
import { groupSearchTerm } from "@/lib/chat";
import { useChat } from "@/components/chat/ChatProvider";
import { GroupAvatar } from "@/components/chat/GroupForm";

const DEBOUNCE_MS = 250;

/**
 * Public groups from /api/chat/groups for `term` ("" = most popular), tagged with
 * the term they answer. Waits for sign-in to be restored so the request has a token.
 */
function useGroups(term) {
  const { uid } = useChat();
  const [found, setFound] = useState({ key: null, items: [] });
  const [failed, setFailed] = useState({ key: null, message: "" });
  const cache = useRef(new Map());

  useEffect(() => {
    if (!uid) return;
    const cached = cache.current.get(term);
    const t = setTimeout(async () => {
      if (cached) return setFound({ key: term, items: cached });
      const r = await authFetch(`/api/chat/groups?q=${encodeURIComponent(term)}`).catch((e) => ({ error: e.message }));
      if (r.error) return setFailed({ key: term, message: r.error });
      cache.current.set(term, r.items || []);
      setFound({ key: term, items: r.items || [] });
    }, cached || !term ? 0 : DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [term, uid]);

  const status = found.key === term ? "done" : failed.key === term ? "error" : "loading";
  return { items: found.key === term ? found.items : [], status, error: failed.message };
}

/** One public group: tap to open it if you're in, or to join. */
function GroupRow({ group, member, busy, onOpen, onJoin }) {
  return (
    <li>
      <button
        type="button"
        disabled={busy}
        onClick={() => (member ? onOpen(group.id) : onJoin(group))}
        className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left hover:bg-white/[0.05] transition-colors disabled:opacity-60"
      >
        <GroupAvatar size={38} rounded="rounded-xl" groupId={group.id} version={group.photoVersion} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold truncate">{group.groupName}</span>
          <span className="block text-[11px] text-white/45 truncate">
            {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
            {group.description ? ` · ${group.description}` : ""}
          </span>
        </span>
        <span className={`shrink-0 h-7 px-3 rounded-lg flex items-center text-[11px] font-black uppercase ${member ? "bg-white/[0.06] text-white/70" : "bg-[#8B1E3F] text-white"}`}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : member ? "Open" : "Join"}
        </span>
      </button>
    </li>
  );
}

/**
 * Find public groups by name. Results show under the box while you type.
 * `memberOf` (ids of groups you're in) keeps Open/Join right after you join.
 */
export default function GroupSearch({ memberOf, joining, onOpen, onJoin }) {
  const [q, setQ] = useState("");
  const term = groupSearchTerm(q);
  const { items, status, error } = useGroups(term);

  return (
    <div className="bg-[#142036] rounded-2xl p-4 border border-white/5">
      <p className="text-[10px] font-black uppercase text-white/40 mb-2">Find groups</p>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQ("")}
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Search public groups by name…"
          className="w-full bg-black/40 border border-white/10 focus:border-[#8B1E3F] rounded-xl pl-9 pr-9 py-2.5 text-base md:text-sm outline-none transition-colors [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10">
            {status === "loading" ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
          </button>
        )}
      </div>

      {term && (
        <ul className="mt-2 -mx-1 max-h-80 overflow-y-auto" aria-live="polite">
          {items.map((g) => (
            <GroupRow key={g.id} group={g} member={g.isMember || memberOf.has(g.id)} busy={joining === g.id} onOpen={onOpen} onJoin={onJoin} />
          ))}
          {status === "loading" && <li className="px-2 py-3 text-xs text-white/40">Searching…</li>}
          {status === "error" && <li className="px-2 py-3 text-xs text-red-300">{error}</li>}
          {status === "done" && !items.length && (
            <li className="px-2 py-3 text-xs text-white/40">No public groups match “{q.trim()}”. Create one?</li>
          )}
        </ul>
      )}
    </div>
  );
}

/** The biggest public groups you're not in yet, to browse without searching. Hidden when there are none. */
export function PopularGroups({ memberOf, joining, onOpen, onJoin }) {
  const { items, status } = useGroups("");
  const fresh = items.filter((g) => !g.isMember && !memberOf.has(g.id));
  if (status !== "done" || !fresh.length) return null;

  return (
    <div className="bg-[#142036] rounded-2xl border border-white/5 p-2">
      <p className="text-[10px] font-black uppercase tracking-wider text-white/40 px-2 pt-1.5 pb-1">Popular public groups</p>
      <ul>
        {fresh.slice(0, 8).map((g) => (
          <GroupRow key={g.id} group={g} member={false} busy={joining === g.id} onOpen={onOpen} onJoin={onJoin} />
        ))}
      </ul>
    </div>
  );
}
