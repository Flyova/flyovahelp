"use client";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { ArrowDownLeft, ArrowUpRight, BarChart3 } from "lucide-react";
import { auth } from "@/lib/firebase";
import { authFetch } from "@/lib/authFetch";
import { PERIODS, PERIOD_LABELS, myTz } from "@/lib/periods";

const usd = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * An agent's completed deposits and withdrawals today, this week, month and year
 * (/api/trades?view=agentStats). `refreshKey` changes when a trade finishes.
 */
export default function AgentTradeTotals({ refreshKey }) {
  const [periods, setPeriods] = useState(null);
  const [period, setPeriod] = useState("day");
  const [error, setError] = useState("");
  const [uid, setUid] = useState(null);

  // Ask once the sign-in is back (a fresh page load restores it a moment later).
  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid || null)), []);

  useEffect(() => {
    if (!uid) return;
    let live = true;
    authFetch(`/api/trades?view=agentStats&tz=${myTz()}`).then((res) => {
      if (!live) return;
      if (res.error) setError(res.error);
      else { setPeriods(res.periods); setError(""); }
    });
    return () => { live = false; };
  }, [uid, refreshKey]);

  const p = periods?.[period];
  const rows = [
    { key: "deposit", label: "Deposits", icon: ArrowDownLeft, color: "text-emerald-400" },
    { key: "withdrawal", label: "Withdrawals", icon: ArrowUpRight, color: "text-[#7A9BEE]" },
  ];

  return (
    <section className="space-y-4">
      <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-500 px-2 flex items-center gap-2">
        <BarChart3 size={14} /> Your Completed Trades
      </h2>
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-1">
        {PERIODS.map((k) => (
          <button key={k} onClick={() => setPeriod(k)}
            className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest whitespace-nowrap border ${period === k ? "bg-[#2457D6] border-[#2457D6] text-white" : "bg-[#142036] border-white/5 text-gray-400"}`}>
            {PERIOD_LABELS[k]}
          </button>
        ))}
      </div>
      {error ? (
        <p className="text-[11px] font-bold text-red-400 px-2">{error}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {rows.map(({ key, label, icon: Icon, color }) => (
            <div key={key} className="bg-[#142036] p-5 rounded-[2rem] border border-white/5">
              <p className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 ${color}`}><Icon size={12} /> {label}</p>
              <p className="text-xl font-black italic mt-2">{p ? usd(p[key].amount) : "…"}</p>
              <p className="text-[10px] font-bold text-white/40 uppercase">{p ? `${p[key].count} trade${p[key].count === 1 ? "" : "s"}` : ""}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
