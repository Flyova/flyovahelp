"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { BadgeDollarSign, Loader2, TrendingUp, User } from "lucide-react";

// Admin → Inflow Bonus (lib/inflowBonus): payouts of the bonus to players' main
// wallets and $250 one-time access purchases (inflow_ledger, written by /api/inflow),
// and the biggest balances still building up (users/{uid}.inflowBonus).

const TABS = [["payout", "Payouts"], ["access", "Access Purchases"], ["balances", "Balances"]];
const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (ts) => (ts?.toDate ? ts.toDate().toLocaleString() : "-");

export default function AdminInflow() {
  const [tab, setTab] = useState("payout");
  const [ledger, setLedger] = useState([]);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState({ ledger: true, balances: true });

  useEffect(() => {
    // Newest first; split by kind here so no extra index is needed.
    const unsubLedger = onSnapshot(query(collection(db, "inflow_ledger"), orderBy("createdAt", "desc"), limit(500)), (snap) => {
      setLedger(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading((l) => ({ ...l, ledger: false }));
    }, (err) => {
      console.error("Inflow ledger load failed:", err);
      setLoading((l) => ({ ...l, ledger: false }));
    });
    const unsubBalances = onSnapshot(query(collection(db, "users"), orderBy("inflowBonus", "desc"), limit(100)), (snap) => {
      setBalances(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => Number(u.inflowBonus || 0) > 0 || u.inflowAccess));
      setLoading((l) => ({ ...l, balances: false }));
    }, (err) => {
      console.error("Inflow balances load failed:", err);
      setLoading((l) => ({ ...l, balances: false }));
    });
    return () => { unsubLedger(); unsubBalances(); };
  }, []);

  const payouts = useMemo(() => ledger.filter((r) => r.kind === "payout"), [ledger]);
  const purchases = useMemo(() => ledger.filter((r) => r.kind === "access"), [ledger]);
  const totals = useMemo(() => ({
    paidOut: payouts.reduce((s, r) => s + Number(r.amount || 0), 0),
    access: purchases.reduce((s, r) => s + Number(r.amount || 0), 0),
    outstanding: balances.reduce((s, u) => s + Number(u.inflowBonus || 0), 0),
  }), [payouts, purchases, balances]);

  const rows = tab === "payout" ? payouts : purchases;
  const busy = tab === "balances" ? loading.balances : loading.ledger;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-5 bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <div className="p-4 bg-emerald-100 text-emerald-600 rounded-3xl">
            <TrendingUp size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black uppercase italic tracking-tighter">Inflow Bonus</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              Payouts on the 15th · $250 access purchases · balances building up
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Stat label="Paid out to wallets" value={money(totals.paidOut)} sub={`${payouts.length} payouts`} />
          <Stat label="Access purchases" value={money(totals.access)} sub={`${purchases.length} × $250`} />
          <Stat label="Outstanding (top 100)" value={money(totals.outstanding)} sub={`${balances.length} accounts`} />
        </div>

        <div className="flex flex-wrap gap-2">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-full text-[10px] font-black uppercase border transition-all ${tab === key ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-slate-400"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
          {busy ? (
            <div className="flex justify-center py-20 text-slate-400"><Loader2 className="animate-spin" /></div>
          ) : tab === "balances" ? (
            balances.length === 0 ? <Empty text="No inflow balances yet." /> : (
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-400">
                  <tr><th className="p-4">Player</th><th className="p-4">Balance</th><th className="p-4">Earned (all time)</th><th className="p-4">Access</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {balances.map((u) => (
                    <tr key={u.id} className="text-xs font-bold">
                      <td className="p-4"><PlayerLink uid={u.id} name={u.username ? `@${u.username}` : u.fullName} /></td>
                      <td className="p-4 font-black text-emerald-600">{money(u.inflowBonus)}</td>
                      <td className="p-4">{money(u.inflowEarned)}</td>
                      <td className="p-4">
                        {u.inflowAccess
                          ? <span className="text-[9px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-black uppercase">Bought</span>
                          : <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-black uppercase">By age</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : rows.length === 0 ? <Empty text={tab === "payout" ? "No payouts yet." : "No access purchases yet."} /> : (
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-400">
                <tr><th className="p-4">Player</th><th className="p-4">Amount</th><th className="p-4">Date</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="text-xs font-bold">
                    <td className="p-4"><PlayerLink uid={r.userId} name={r.username ? `@${r.username}` : r.fullName} /></td>
                    <td className={`p-4 font-black ${tab === "payout" ? "text-emerald-600" : "text-[#2457D6]"}`}>{money(r.amount)}</td>
                    <td className="p-4 text-slate-500">{when(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm">
      <div className="flex items-center gap-2 text-slate-400">
        <BadgeDollarSign size={14} />
        <p className="text-[9px] font-black uppercase tracking-widest">{label}</p>
      </div>
      <p className="text-2xl font-black italic mt-2">{value}</p>
      <p className="text-[10px] font-bold text-slate-400 mt-1">{sub}</p>
    </div>
  );
}

function PlayerLink({ uid, name }) {
  if (!uid) return <span className="text-slate-400">Unknown</span>;
  return (
    <Link href={`/admin/users/${uid}`} className="inline-flex items-center gap-1 text-slate-800 hover:text-[#2457D6]">
      <User size={12} /> {name || uid.slice(0, 8)}
    </Link>
  );
}

function Empty({ text }) {
  return <div className="p-12 text-center text-[11px] font-black uppercase tracking-widest text-slate-400">{text}</div>;
}
