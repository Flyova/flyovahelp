"use client";
import { useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { authFetch } from "@/lib/authFetch";
import { CheckCircle2, Loader2, Plus, Search, Send, Trash2, Trophy, User, X } from "lucide-react";

// Admin → Send Jackpot: one or many players, each with their own amount. Every jackpot
// is a pending jackpots/{id} the player claims from their dashboard (/api/wallet
// "jackpot"); /api/admin/jackpot writes them all in a single batch, tagged with the same
// batchId, and notifies each player.

const MAX_RECIPIENTS = 100;
const MAX_JACKPOT = 1000000; // lib/money MAX_AMOUNT: the claim refuses more
const usd = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The amount typed in a row, in dollars (whole cents), or null if it isn't one. */
function amountOf(value) {
  const s = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100) / 100;
  return n > 0 && n <= MAX_JACKPOT ? n : null;
}

export default function AdminJackpot() {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [rows, setRows] = useState([]); // [{ user: { id, email, username, fullName }, amount: "" }]
  const [reviewing, setReviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(null); // { count, total }

  // Players whose email or account username starts with what was typed.
  const handleSearch = async (e) => {
    e?.preventDefault();
    const term = searchTerm.trim().replace(/^@/, "");
    if (!term) return;
    setSearching(true);
    try {
      const prefix = (field, value) => getDocs(query(collection(db, "users"), where(field, ">=", value), where(field, "<=", `${value}`), limit(8)));
      const snaps = await Promise.all([prefix("email", term), prefix("email", term.toLowerCase()), prefix("username", term)]);
      const found = new Map();
      for (const s of snaps) for (const d of s.docs) found.set(d.id, { id: d.id, email: d.data().email || "", username: d.data().username || "", fullName: d.data().fullName || "" });
      setResults([...found.values()]);
    } catch (err) {
      console.error(err);
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const addRow = (user) => {
    setError("");
    setSent(null);
    setRows((r) => (r.some((x) => x.user.id === user.id) || r.length >= MAX_RECIPIENTS ? r : [...r, { user, amount: "" }]));
  };
  const setAmount = (id, amount) => setRows((r) => r.map((x) => (x.user.id === id ? { ...x, amount } : x)));
  const removeRow = (id) => setRows((r) => r.filter((x) => x.user.id !== id));

  const total = useMemo(() => rows.reduce((s, x) => s + (amountOf(x.amount) || 0), 0), [rows]);
  const invalid = rows.filter((x) => amountOf(x.amount) === null).length;

  const review = () => {
    if (!rows.length) return setError("Add at least one player.");
    if (invalid) return setError(`Enter an amount for ${invalid === 1 ? "1 player" : `${invalid} players`} (more than $0, at most 2 decimals).`);
    setError("");
    setReviewing(true);
  };

  const send = async () => {
    if (sending) return;
    setSending(true);
    setError("");
    try {
      const res = await authFetch("/api/admin/jackpot", {
        method: "POST",
        body: { recipients: rows.map(({ user, amount }) => ({ uid: user.id, amount: amountOf(amount) })) },
      });
      if (res?.error) {
        setError(`Failed to dispatch the jackpots: ${res.error} Nothing was sent.`);
      } else {
        setSent({ count: res.count, total: res.total });
        setRows([]);
        setResults(null);
        setSearchTerm("");
      }
      setReviewing(false);
    } catch (err) {
      console.error(err);
      setError(`Could not reach the server (${err?.message || err}). Check the players' jackpots before sending again.`);
      setReviewing(false);
    } finally {
      setSending(false);
    }
  };

  const who = (u) => (u.username ? `@${u.username}` : u.fullName || u.email);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-4 bg-amber-100 text-amber-600 rounded-3xl">
          <Trophy size={32} />
        </div>
        <div>
          <h1 className="text-3xl font-black uppercase italic tracking-tighter text-slate-800">Jackpot Dispatch</h1>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Send jackpots to one or many players, each with its own amount</p>
        </div>
      </div>

      {sent && (
        <div role="status" className="bg-emerald-500 text-white rounded-[2rem] p-6 flex items-center gap-3">
          <CheckCircle2 size={28} />
          <p className="font-black uppercase tracking-widest italic text-sm">
            {sent.count === 1 ? "1 jackpot" : `${sent.count} jackpots`} dispatched · {usd(sent.total)}
          </p>
          <button onClick={() => setSent(null)} className="ml-auto opacity-80 hover:opacity-100" aria-label="Dismiss"><X size={18} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Step 1: Find players */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
          <h3 className="text-sm font-black text-[#1D4FC4] uppercase mb-6 flex items-center gap-2">
            <User size={16} className="text-[#1D4FC4]" /> 1. Add Players
          </h3>

          <form onSubmit={handleSearch} className="flex gap-2 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search email or username..."
                className="w-full bg-slate-50 border text-black border-slate-100 rounded-2xl py-3 pl-10 pr-4 text-sm outline-none focus:border-[#2457D6] transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="bg-slate-800 text-white px-6 rounded-2xl font-bold text-xs uppercase hover:bg-black transition-all"
            >
              {searching ? <Loader2 className="animate-spin" size={16} /> : "Find"}
            </button>
          </form>

          <div className="space-y-2">
            {results?.length === 0 && <p className="text-xs font-bold text-slate-400 text-center py-4">No players found.</p>}
            {results?.map((u) => {
              const added = rows.some((x) => x.user.id === u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => addRow(u)}
                  disabled={added || rows.length >= MAX_RECIPIENTS}
                  className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    added ? "border-[#2457D6] bg-[#D7E2FF]" : "border-slate-100 hover:bg-slate-50"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-black text-slate-700 truncate">{u.email || who(u)}</span>
                    <span className="block text-[10px] text-slate-400 truncate">{u.username ? `@${u.username} · ` : ""}UID: {u.id.slice(0, 8)}...</span>
                  </span>
                  {added ? <CheckCircle2 size={18} className="text-[#1D4FC4] shrink-0" /> : <Plus size={18} className="text-slate-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Amounts & Send */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
          <h3 className="text-sm font-black uppercase mb-6 text-[#1D4FC4] flex items-center gap-2">
            <Send size={16} className="text-amber-600" /> 2. Set Amounts
          </h3>

          {rows.length === 0 ? (
            <p className="text-xs font-bold text-slate-400 text-center py-10">Find players and tap them to add them here.</p>
          ) : (
            <div className="space-y-2 mb-6 max-h-[50vh] overflow-y-auto pr-1">
              {rows.map(({ user, amount }) => {
                const bad = amount !== "" && amountOf(amount) === null;
                return (
                  <div key={user.id} data-jackpot-row={user.email} className="flex items-center gap-2 p-3 rounded-2xl border border-slate-100">
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-black text-slate-700 truncate">{who(user)}</span>
                      <span className="block text-[10px] text-slate-400 truncate">{user.email}</span>
                    </span>
                    <span className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-slate-400 text-sm">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => setAmount(user.id, e.target.value)}
                        placeholder="0.00"
                        aria-label={`Amount for ${user.email}`}
                        className={`w-28 bg-slate-50 border rounded-xl py-2 pl-7 pr-2 text-sm font-black text-slate-800 outline-none ${bad ? "border-rose-400" : "border-slate-100 focus:border-amber-500"}`}
                      />
                    </span>
                    <button type="button" onClick={() => removeRow(user.id)} aria-label={`Remove ${user.email}`} className="p-2 text-slate-400 hover:text-rose-600">
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between mb-4 text-xs font-black uppercase tracking-widest text-slate-500">
            <span>{rows.length} player{rows.length === 1 ? "" : "s"}</span>
            <span data-jackpot-total>Total {usd(total)}</span>
          </div>
          {error && <p className="text-xs font-bold text-rose-600 mb-4">{error}</p>}
          <button
            type="button"
            onClick={review}
            disabled={!rows.length || sending}
            className="w-full bg-amber-500 hover:bg-amber-600 py-6 rounded-[2rem] text-white font-black uppercase tracking-widest shadow-xl shadow-amber-200 transition-all active:scale-95 disabled:opacity-30 disabled:grayscale"
          >
            Review & Dispatch
          </button>
          {rows.length >= MAX_RECIPIENTS && (
            <p className="text-center text-[10px] font-bold text-slate-400 uppercase mt-3">Up to {MAX_RECIPIENTS} players per dispatch</p>
          )}
        </div>
      </div>

      {reviewing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Confirm jackpots">
          <div className="bg-white rounded-[2rem] w-full max-w-md p-8 space-y-5">
            <h3 className="text-lg font-black uppercase italic tracking-tighter text-slate-800">
              Send {rows.length === 1 ? "1 jackpot" : `${rows.length} jackpots`}?
            </h3>
            <div className="max-h-[45vh] overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-2xl">
              {rows.map(({ user, amount }) => (
                <div key={user.id} className="flex justify-between gap-3 px-4 py-2.5 text-xs">
                  <span className="font-bold text-slate-600 truncate">{who(user)}</span>
                  <span className="font-black text-slate-800">{usd(amountOf(amount))}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm font-black text-slate-800">
              <span>Total</span>
              <span>{usd(total)}</span>
            </div>
            <p className="text-[11px] font-bold text-slate-400">Each player gets a notification, sees their jackpot on their dashboard and claims it into their wallet.</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setReviewing(false)} disabled={sending} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-600 font-black uppercase text-xs">
                Back
              </button>
              <button type="button" onClick={send} disabled={sending} className="flex-1 py-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black uppercase text-xs">
                {sending ? <Loader2 className="animate-spin mx-auto" size={18} /> : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
