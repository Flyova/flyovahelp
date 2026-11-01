"use client";
import { useState } from "react";
import Link from "next/link";
import { Loader2, Search, Trash2, User, X } from "lucide-react";
import { authFetch } from "@/lib/authFetch";

const when = (ms) => (ms ? new Date(ms).toLocaleString() : "-");

/** `text` with every search word highlighted. */
function Highlight({ text, words }) {
  if (!words.length) return text;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return String(text).split(re).map((part, i) => (i % 2 ? <mark key={i} className="bg-amber-200 text-slate-900 rounded px-0.5">{part}</mark> : part));
}

/**
 * Admin → Chat Room: search the general chatroom for words (/api/chat/room?search=).
 * Firestore can't search text, so the server reads the latest few thousand messages
 * and the results say how far back that went.
 */
export default function ChatRoomSearch() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState(null); // { results, scanned, since, complete, words }
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(null);

  const search = async (e) => {
    e.preventDefault();
    const term = q.trim();
    if (term.length < 2) return setError("Type at least 2 letters.");
    setBusy(true);
    setError("");
    const r = await authFetch(`/api/chat/room?search=${encodeURIComponent(term)}`).catch((err) => ({ error: err.message }));
    setBusy(false);
    if (r.error) return setError(r.error);
    setFound({ ...r, words: term.toLowerCase().split(/\s+/).filter(Boolean) });
  };

  const remove = async (m) => {
    if (!window.confirm(`Delete @${m.senderName || m.sender}'s message for everyone?`)) return;
    setDeleting(m.id);
    const r = await authFetch("/api/chat/room", { method: "POST", body: { action: "delete", id: m.id } });
    setDeleting(null);
    if (r.error) return alert(r.error);
    setFound((f) => f && { ...f, results: f.results.filter((x) => x.id !== m.id) });
  };

  return (
    <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6 space-y-4">
      <form onSubmit={search} className="flex gap-2">
        <label className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-4">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the chat room for words or @username"
            className="flex-1 min-w-0 bg-transparent py-3 text-sm font-bold outline-none"
          />
          {found && (
            <button type="button" onClick={() => { setFound(null); setQ(""); setError(""); }} aria-label="Clear search" className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          )}
        </label>
        <button type="submit" disabled={busy} className="px-5 rounded-2xl bg-sky-600 text-white text-[11px] font-black uppercase disabled:opacity-50">
          {busy ? <Loader2 size={16} className="animate-spin" /> : "Search"}
        </button>
      </form>
      {error && <p className="text-xs font-bold text-rose-600">{error}</p>}

      {found && (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {found.results.length} match{found.results.length === 1 ? "" : "es"} in the latest {found.scanned.toLocaleString()} messages
            {found.since ? ` (since ${when(found.since)})` : ""}{found.complete ? " · the whole chat room" : ""}
          </p>
          {found.results.map((m) => (
            <div key={m.id} className="rounded-[1.5rem] border border-slate-100 p-4 flex flex-col md:flex-row md:items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black text-slate-800">@{m.senderName || m.sender}</span>
                  <span className="text-[10px] font-bold text-slate-400">{when(m.createdAt)}{m.editedAt ? " · edited" : ""}</span>
                </div>
                <p className="text-sm font-bold text-slate-600 mt-1 break-words"><Highlight text={m.text || ""} words={found.words} /></p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {m.senderUid && (
                  <Link href={`/admin/users/${m.senderUid}`} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-black uppercase inline-flex items-center gap-1 hover:bg-slate-200">
                    <User size={12} /> Player
                  </Link>
                )}
                <button onClick={() => remove(m)} disabled={deleting === m.id}
                  className="px-3 py-2 rounded-xl bg-rose-50 text-rose-600 text-[10px] font-black uppercase inline-flex items-center gap-1 hover:bg-rose-100">
                  {deleting === m.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
