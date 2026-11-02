"use client";
import { useState } from "react";
import { CalendarRange, Loader2 } from "lucide-react";
import { CUSTOM_PRESETS, MAX_CUSTOM_DAYS, PERIOD_LABELS, PERIOD_TABS, rangeLabel, ymd } from "@/lib/periods";

/**
 * Today / This week / This month / This year / Custom, for the totals pages (My Totals,
 * an agent's completed trades). `active` is the selected tab's colours.
 */
export function PeriodTabs({ value, onChange, active = "bg-[#8B1E3F] border-[#8B1E3F] text-white" }) {
  return (
    <div className="grid grid-cols-5 gap-1.5" role="tablist">
      {PERIOD_TABS.map((k) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={`min-h-[44px] px-1 py-2 rounded-2xl text-[9px] leading-tight font-black uppercase tracking-wide border-2 ${value === k ? active : "bg-[#142036] border-white/5 text-gray-400"}`}>
          {PERIOD_LABELS[k]}
        </button>
      ))}
    </div>
  );
}

/**
 * Picks the days for the Custom tab: a ready-made range (yesterday, last week, last
 * month…) or any start and end date up to today. `onPick({ from, to })` (YYYY-MM-DD)
 * asks for those totals; `range` is the one shown, `busy` while it loads.
 */
export function CustomRangePicker({ range, onPick, busy, error }) {
  const today = ymd(new Date());
  const [from, setFrom] = useState(range?.from || "");
  const [to, setTo] = useState(range?.to || "");
  const [problem, setProblem] = useState("");

  const pick = (r) => { setFrom(r.from); setTo(r.to); setProblem(""); onPick(r); };
  const apply = () => {
    if (!from || !to) return setProblem("Pick a start and an end date.");
    if (from > to) return setProblem("The start date is after the end date.");
    pick({ from, to });
  };
  const dateInput = "w-full min-w-0 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-[12px] font-bold text-white [color-scheme:dark]";

  return (
    <div data-testid="custom-range" className="bg-[#142036] rounded-[2rem] p-5 border border-white/5 space-y-4">
      <div className="flex flex-wrap gap-2">
        {CUSTOM_PRESETS.map((p) => {
          const r = p.range();
          const on = range?.from === r.from && range?.to === r.to;
          return (
            <button key={p.key} onClick={() => pick(r)} disabled={busy}
              className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border ${on ? "bg-[#2457D6] border-[#2457D6] text-white" : "bg-white/5 border-white/10 text-white/70"}`}>
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 min-w-0">
          <span className="text-[9px] font-black uppercase tracking-widest text-white/40">From</span>
          <input type="date" aria-label="From" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} className={dateInput} />
        </label>
        <label className="space-y-1 min-w-0">
          <span className="text-[9px] font-black uppercase tracking-widest text-white/40">To</span>
          <input type="date" aria-label="To" value={to} min={from || undefined} max={today} onChange={(e) => setTo(e.target.value)} className={dateInput} />
        </label>
      </div>
      <button onClick={apply} disabled={busy}
        className="w-full bg-[#2457D6] disabled:opacity-50 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <CalendarRange size={14} />} Show these days
      </button>
      {(problem || error) && <p className="text-[11px] font-bold text-red-400 text-center">{problem || error}</p>}
      <p className="text-[10px] font-bold text-white/30 text-center">
        {range ? `Showing ${rangeLabel(range)}. ` : ""}Up to {MAX_CUSTOM_DAYS} days at a time.
      </p>
    </div>
  );
}
