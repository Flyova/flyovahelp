"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { authFetch } from "@/lib/authFetch";
import {
  ArrowDownToLine, ArrowRightLeft, ArrowUpRight, CalendarClock, CheckCircle2, ChevronLeft,
  Handshake, Loader2, Lock, Target, TrendingUp, Wallet,
} from "lucide-react";

// The inflow bonus (/api/inflow): whether the account earns it, what it pays for,
// what it has earned, and moving it to the main wallet on the 15th.

const ICONS = { agent_deposit: Handshake, deposit: ArrowDownToLine, guess_scores: Target, transfer: ArrowRightLeft, withdrawal: ArrowUpRight, payout: Wallet };
const usd = (n) => `$${Number(n || 0).toFixed(2)}`;
const day = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");
const when = (ms) => (ms ? new Date(ms).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");

export default function InflowBonusPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const res = await authFetch("/api/inflow");
    if (res.error) setError(res.error);
    else { setData(res); setError(""); }
  }, []);

  useEffect(() => onAuthStateChanged(auth, (u) => (u ? load() : router.push("/login"))), [load, router]);

  const act = async (action, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(action);
    const res = await authFetch("/api/inflow", { method: "POST", body: { action } });
    setBusy("");
    if (res.error) return alert(res.error);
    alert(action === "withdraw" ? `${usd(res.amount)} moved to your main wallet.` : "Inflow bonus unlocked. You now earn on your activity.");
    load();
  };

  if (!data) return (
    <div className="min-h-screen bg-[#0B1220] flex items-center justify-center">
      {error
        ? <p className="text-sm font-bold text-red-400 px-6 text-center">{error}</p>
        : <div className="font-black italic text-white animate-pulse uppercase tracking-widest">Loading Inflow Bonus...</div>}
    </div>
  );

  const label = (key) => data.categories.find((c) => c.key === key)?.label || (key === "payout" ? "Moved to main wallet" : key);
  const canWithdraw = data.eligible && data.payoutToday && data.balance > 0;

  return (
    <div className="min-h-screen bg-[#0B1220] text-white flex flex-col pb-12">
      <div className="p-6 pt-12 flex items-center gap-4 max-w-md mx-auto w-full">
        <button onClick={() => router.back()} className="p-3 bg-[#142036] rounded-2xl border border-white/5 active:scale-90 transition-all" aria-label="Back">
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-xl font-black italic uppercase tracking-tighter">Inflow Bonus</h1>
      </div>

      <div className="p-6 space-y-6 max-w-md mx-auto w-full">
        {/* BALANCE */}
        <div className="bg-gradient-to-br from-[#2457D6] to-[#1D4FC4] p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
          <TrendingUp className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 rotate-12" />
          <div className="relative z-10">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60 mb-1">Inflow Bonus Balance</p>
            <h2 className="text-5xl font-black italic tracking-tighter">{usd(data.balance)}</h2>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-white/60">Earned in total: {usd(data.earned)}</p>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2 relative z-10">
            <div className="inline-flex items-center bg-black/20 px-4 py-2 rounded-full border border-white/10">
              <CalendarClock size={14} className="mr-2 text-green-400" />
              <span className="text-[10px] font-black uppercase tracking-widest">
                {data.payoutToday ? "Payout day: today" : `Next payout ${day(data.nextPayoutAt)}`}
              </span>
            </div>
          </div>
          <button
            onClick={() => act("withdraw", `Move ${usd(data.balance)} inflow bonus to your main wallet?`)}
            disabled={!canWithdraw || !!busy}
            className="relative z-10 mt-5 w-full bg-white/10 py-3 rounded-2xl border border-white/20 hover:bg-white/20 disabled:opacity-50 disabled:hover:bg-white/10 transition-all flex items-center justify-center gap-2"
          >
            {busy === "withdraw" ? <Loader2 size={16} className="animate-spin" /> : canWithdraw ? <Wallet size={16} /> : <Lock size={16} />}
            <span className="text-[10px] font-black uppercase tracking-widest">Withdraw to main wallet</span>
          </button>
          {!data.payoutToday && (
            <p className="relative z-10 mt-2 text-[10px] font-bold text-white/60 text-center">
              Withdrawals open on the {data.payoutDay}th of every month (UTC).
            </p>
          )}
        </div>

        {/* ELIGIBILITY */}
        <div className="bg-[#142036] rounded-[2rem] p-6 border border-white/5 shadow-xl space-y-4">
          <div className="flex items-center gap-3">
            {data.eligible ? <CheckCircle2 size={20} className="text-emerald-400 shrink-0" /> : <Lock size={20} className="text-amber-400 shrink-0" />}
            <div>
              <h3 className="font-black italic uppercase text-sm">{data.eligible ? "You're eligible" : "Not eligible yet"}</h3>
              <p className="text-[11px] font-bold text-gray-400 leading-relaxed">
                {data.eligible
                  ? data.purchased ? "You unlocked the inflow bonus with a one-time payment." : `Your account is over ${data.minAgeMonths} months old.`
                  : `The inflow bonus is for accounts at least ${data.minAgeMonths} months old.${data.eligibleAt ? ` Yours qualifies on ${day(data.eligibleAt)}.` : ""}`}
              </p>
            </div>
          </div>
          {!data.eligible && (
            <button
              onClick={() => act("buyAccess", `Pay ${usd(data.accessPrice)} from your main wallet to unlock the inflow bonus now?`)}
              disabled={!!busy}
              className="w-full bg-[#8B1E3F] hover:bg-[#A62A4D] disabled:opacity-50 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
            >
              {busy === "buyAccess" && <Loader2 size={14} className="animate-spin" />}
              Unlock now for {usd(data.accessPrice)}
            </button>
          )}
        </div>

        {/* WHAT EARNS IT */}
        <div className="space-y-3">
          <h3 className="font-black italic uppercase text-xs text-white/40 tracking-widest px-2">What earns it</h3>
          {data.categories.map((c) => {
            const Icon = ICONS[c.key] || TrendingUp;
            return (
              <div key={c.key} className="bg-[#142036] rounded-3xl p-4 border border-white/5 flex items-center gap-4">
                <div className="w-11 h-11 rounded-2xl bg-[#2457D6]/15 flex items-center justify-center shrink-0"><Icon size={18} className="text-[#7A9BEE]" /></div>
                <div className="min-w-0 flex-1">
                  <p className="font-black italic uppercase text-[13px]">{c.label}</p>
                  <p className="text-[11px] font-bold text-gray-400 leading-snug">{c.text}</p>
                </div>
                <span className="text-sm font-black italic text-green-400 shrink-0">{+(c.rate * 100).toFixed(2)}%</span>
              </div>
            );
          })}
        </div>

        {/* HISTORY */}
        <div className="space-y-3">
          <h3 className="font-black italic uppercase text-xs text-white/40 tracking-widest px-2">History</h3>
          {data.history.length === 0 ? (
            <div className="bg-[#142036] rounded-[2rem] p-10 border border-dashed border-white/10 text-center">
              <TrendingUp size={40} className="mx-auto mb-3 text-white/5" />
              <p className="text-[10px] font-black uppercase text-white/20 tracking-widest">No inflow bonus yet</p>
            </div>
          ) : data.history.map((r) => {
            const Icon = ICONS[r.category] || TrendingUp;
            const payout = r.amount < 0;
            return (
              <div key={r.id} className="bg-[#142036] rounded-3xl p-4 border border-white/5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center shrink-0"><Icon size={16} className="text-white/50" /></div>
                <div className="min-w-0 flex-1">
                  <p className="font-black uppercase text-[12px] truncate">{label(r.category)}</p>
                  <p className="text-[10px] font-bold text-gray-500 truncate">
                    {[payout ? "" : `${+(r.rate * 100).toFixed(2)}% of ${usd(r.base)}`, r.note, when(r.createdAt)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className={`text-sm font-black italic shrink-0 ${payout ? "text-white/60" : "text-green-400"}`}>
                  {payout ? "−" : "+"}{usd(Math.abs(r.amount))}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
