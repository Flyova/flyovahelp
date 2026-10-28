"use client";
import { Plus, Trash2 } from "lucide-react";

const MAX_TIERS = 5; // lib/money MAX_RATE_TIERS

/**
 * An agent's rates for bigger trades: each row's rate is used from its amount up
 * (until the next row); below the first row, the plain rate applies.
 * `tiers` is [{ min, rate }] with string values while editing.
 */
export default function RateTiers({ label, color, tiers, onChange }) {
  const set = (i, key, value) => onChange(tiers.map((t, j) => (j === i ? { ...t, [key]: value } : t)));
  return (
    <div className="space-y-2">
      <p className={`text-[9px] font-black uppercase ${color}`}>{label}: rates for bigger amounts</p>
      {tiers.map((t, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[10px] font-black text-white/40">From $</span>
          <input type="number" min="1" value={t.min} onChange={(e) => set(i, "min", e.target.value)} placeholder="100"
            className="w-20 bg-[#0B1220] border border-white/10 rounded-xl px-3 py-2 text-sm font-black outline-none text-white" />
          <span className="text-[10px] font-black text-white/40">rate</span>
          <input type="number" min="0" value={t.rate} onChange={(e) => set(i, "rate", e.target.value)} placeholder="0.00"
            className="flex-1 min-w-0 bg-[#0B1220] border border-white/10 rounded-xl px-3 py-2 text-sm font-black outline-none text-white" />
          <button type="button" onClick={() => onChange(tiers.filter((_, j) => j !== i))} className="p-2 rounded-xl bg-white/5 text-rose-400" aria-label="Remove">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      {tiers.length < MAX_TIERS && (
        <button type="button" onClick={() => onChange([...tiers, { min: "", rate: "" }])}
          className="flex items-center gap-1 text-[10px] font-black uppercase text-white/50 hover:text-white">
          <Plus size={12} /> Add amount range
        </button>
      )}
    </div>
  );
}

/** Saved tiers -> editable rows, and back (the server checks them again). */
export const tiersToRows = (tiers) => (Array.isArray(tiers) ? tiers.map((t) => ({ min: String(t.min ?? ""), rate: String(t.rate ?? "") })) : []);
export const rowsToTiers = (rows) => rows.filter((r) => r.min !== "" || r.rate !== "").map((r) => ({ min: Number(r.min), rate: Number(r.rate) }));
