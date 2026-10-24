"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Settings2, Trash2 } from "lucide-react";
import Avatar from "@/components/Avatar";

/**
 * Compact "Chatting as" bar: your chat usernames as chips (tap to switch) and a
 * Manage panel, closed by default, for buying or deleting usernames.
 * `onCreate(name)` resolves to an error message, or "" on success.
 */
export default function IdentityBar({ identities, active, onSelect, onCreate, onDelete }) {
  const [manage, setManage] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    const problem = await onCreate(name.trim().replace(/^@/, ""));
    setBusy(false);
    if (problem) return setError(problem);
    setName("");
  };

  return (
    <div className="bg-[#142036] rounded-2xl border border-white/5">
      <div className="flex items-center gap-2 p-2.5 pl-3.5">
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-white/40">As</span>
        <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {identities.map((i) => {
            const selected = active === i.usernameLower;
            return (
              <button
                key={i.usernameLower}
                type="button"
                onClick={() => onSelect(i.usernameLower)}
                aria-pressed={selected}
                className={`shrink-0 flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-xl text-xs font-bold border transition-colors ${selected ? "bg-[#8B1E3F] border-[#8B1E3F] text-white" : "bg-black/25 border-white/10 text-white/70 hover:text-white"}`}
              >
                <Avatar username={i.usernameLower} size={22} rounded="rounded-lg" />@{i.username}
              </button>
            );
          })}
          {!identities.length && <span className="text-xs text-white/40">No chat username yet</span>}
        </div>
        <button
          type="button"
          onClick={() => setManage((v) => !v)}
          aria-expanded={manage}
          aria-label="Manage chat usernames"
          className={`shrink-0 flex items-center gap-1 h-8 px-2.5 rounded-xl text-[11px] font-black uppercase transition-colors ${manage ? "bg-white/10 text-white" : "text-white/60 hover:text-white hover:bg-white/5"}`}
        >
          <Settings2 size={14} />
          <span className="hidden sm:inline">Manage</span>
          <ChevronDown size={13} className={`transition-transform ${manage ? "rotate-180" : ""}`} />
        </button>
      </div>

      {manage && (
        <div className="border-t border-white/5 p-3.5 space-y-3">
          <div>
            <p className="text-[10px] font-black uppercase text-white/40 mb-1.5">Add a chat username</p>
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/35">@</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && create()}
                  placeholder="new username"
                  autoComplete="off"
                  className="w-full bg-black/40 border border-white/10 focus:border-[#8B1E3F] rounded-xl pl-7 pr-3 py-2 text-sm outline-none"
                />
              </div>
              <button type="button" onClick={create} disabled={busy || !name.trim()} className="shrink-0 bg-[#8B1E3F] px-4 rounded-xl text-xs font-black uppercase disabled:opacity-50">
                {busy ? "…" : "Buy"}
              </button>
            </div>
            {error && <p className="text-xs text-red-300 mt-1.5">{error}</p>}
            <p className="text-[10px] leading-relaxed text-white/40 mt-1.5">
              Your first extra username is free, then $1 each from your wallet (accounts 8+ months old get 100 free, agents 5).
            </p>
          </div>

          {identities.some((i) => !i.isDefault) && (
            <div>
              <p className="text-[10px] font-black uppercase text-white/40 mb-1">Your usernames</p>
              {identities.map((i) => (
                <div key={i.usernameLower} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                  <span className="flex items-center gap-2 min-w-0">
                    <Avatar username={i.usernameLower} size={22} rounded="rounded-lg" />
                    <span className="truncate font-bold">@{i.username}</span>
                    {i.isDefault && <span className="text-[9px] font-black uppercase text-white/35">Default</span>}
                  </span>
                  {!i.isDefault && (
                    <button type="button" onClick={() => onDelete(i.usernameLower)} aria-label={`Delete @${i.username}`} className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-red-300/80 hover:text-red-300 hover:bg-white/5">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] leading-relaxed text-white/35">
            To chat as another account&apos;s username, log in to that account first.{" "}
            <Link href="/settings#chat-profile" className="font-black uppercase text-[#E0708C] hover:underline">Bio, status &amp; devices →</Link>
          </p>
        </div>
      )}
    </div>
  );
}
