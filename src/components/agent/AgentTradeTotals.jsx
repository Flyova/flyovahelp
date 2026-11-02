"use client";
import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { ArrowDownLeft, ArrowUpRight, BarChart3 } from "lucide-react";
import { auth } from "@/lib/firebase";
import { authFetch } from "@/lib/authFetch";
import { myTz, rangeLabel, rangeQuery } from "@/lib/periods";
import { CustomRangePicker, PeriodTabs } from "@/components/PeriodTabs";

const usd = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The Custom tab's state for `range`: its totals, or why they couldn't be had. */
const loadRange = (range) => authFetch(`/api/trades?view=agentStats&tz=${myTz()}${rangeQuery(range)}`).then((res) => (res.error
  ? { range, totals: null, busy: false, error: res.error }
  : { range, totals: res.periods?.custom || null, busy: false, error: "" }));

/**
 * An agent's completed deposits and withdrawals today, this week, month and year, or
 * in days they pick (/api/trades?view=agentStats). `refreshKey` changes when a trade finishes.
 */
export default function AgentTradeTotals({ refreshKey }) {
  const [periods, setPeriods] = useState(null);
  const [period, setPeriod] = useState("day");
  const [error, setError] = useState("");
  const [uid, setUid] = useState(null);
  // The Custom tab: the days picked and their totals.
  const [custom, setCustom] = useState({ range: null, totals: null, busy: false, error: "" });
  const pickedRange = useRef(null);

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
    // A finished trade can change the custom totals too.
    if (pickedRange.current) loadRange(pickedRange.current).then((c) => live && setCustom(c));
    return () => { live = false; };
  }, [uid, refreshKey]);

  const askRange = async (range) => {
    pickedRange.current = range;
    setCustom({ range, totals: null, busy: true, error: "" });
    setCustom(await loadRange(range));
  };

  const isCustom = period === "custom";
  const p = isCustom ? custom.totals : periods?.[period];
  const rows = [
    { key: "deposit", label: "Deposits", icon: ArrowDownLeft, color: "text-emerald-400" },
    { key: "withdrawal", label: "Withdrawals", icon: ArrowUpRight, color: "text-[#7A9BEE]" },
  ];

  return (
    <section className="space-y-4">
      <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-500 px-2 flex items-center gap-2">
        <BarChart3 size={14} /> Your Completed Trades
      </h2>
      <PeriodTabs value={period} onChange={setPeriod} active="bg-[#2457D6] border-[#2457D6] text-white" />
      {isCustom && <CustomRangePicker range={custom.range} onPick={askRange} busy={custom.busy} error={custom.error} />}
      {isCustom && !custom.totals ? null : error && !isCustom ? (
        <p className="text-[11px] font-bold text-red-400 px-2">{error}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {isCustom && custom.range && (
            <p className="col-span-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/50 px-2">{rangeLabel(custom.range)}</p>
          )}
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
