"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { ArrowDownLeft, ArrowUpRight, Coins, Loader2, ShoppingCart, User, Wallet } from "lucide-react";

// Admin → Chat Coins: every chat username's coin wallet (username_wallets/{name},
// lib/coinWallets) with its owner and balance, and a wallet's movements (its
// activity: purchases, withdrawals, coins sent and received). Per wallet only: a
// feed across all wallets would need a collection-group index.

const KINDS = {
  buy: { label: "Purchase", icon: ShoppingCart, tone: "bg-emerald-100 text-emerald-700" },
  withdraw: { label: "Withdrawal", icon: ArrowUpRight, tone: "bg-amber-100 text-amber-700" },
  sent: { label: "Sent", icon: ArrowUpRight, tone: "bg-rose-100 text-rose-700" },
  received: { label: "Received", icon: ArrowDownLeft, tone: "bg-sky-100 text-sky-700" },
  moved: { label: "Moved in", icon: Wallet, tone: "bg-slate-200 text-slate-700" },
};
const coins = (n) => Number(n || 0).toLocaleString();
const dollars = (c) => `$${(Number(c || 0) / 100).toFixed(2)}`;
const when = (ts) => (ts?.toDate ? ts.toDate().toLocaleString() : "-");

export default function AdminChatCoins() {
  const [wallets, setWallets] = useState([]);
  const [owners, setOwners] = useState({});
  const [loading, setLoading] = useState(true);
  const [desc, setDesc] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "username_wallets"), orderBy("balance", desc ? "desc" : "asc"), limit(300));
    return onSnapshot(q, (snap) => {
      setWallets(snap.docs.map((d) => ({ name: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error("Coin wallets load failed:", err);
      setLoading(false);
    });
  }, [desc]);

  // Each wallet's owner: usernames/{name}.uid, then that account's name (looked up once).
  useEffect(() => {
    const missing = wallets.map((w) => w.name).filter((n) => !(n in owners));
    if (!missing.length) return;
    let live = true;
    Promise.all(missing.map(async (name) => {
      const u = await getDoc(doc(db, "usernames", name)).catch(() => null);
      const uid = u?.exists() ? u.data().uid : null;
      const acct = uid ? await getDoc(doc(db, "users", uid)).catch(() => null) : null;
      return [name, { uid, account: acct?.exists() ? (acct.data().username || acct.data().fullName || "") : "", deleted: !!u?.data()?.deleted }];
    })).then((found) => {
      if (live) setOwners((o) => ({ ...o, ...Object.fromEntries(found) }));
    });
    return () => { live = false; };
  }, [wallets, owners]);

  useEffect(() => {
    if (!selected) return;
    const q = query(collection(db, "username_wallets", selected, "activity"), orderBy("createdAt", "desc"), limit(200));
    return onSnapshot(q, (snap) => {
      setActivity(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setActivityLoading(false);
    }, () => setActivityLoading(false));
  }, [selected]);

  const open = (name) => {
    setActivity([]);
    setActivityLoading(true);
    setSelected(name);
  };

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? wallets.filter((w) => w.name.includes(s) || (owners[w.name]?.account || "").toLowerCase().includes(s)) : wallets;
  }, [wallets, owners, search]);
  const totalCoins = useMemo(() => wallets.reduce((s, w) => s + Number(w.balance || 0), 0), [wallets]);
  const summary = useMemo(() => {
    const t = { buy: 0, withdraw: 0, sent: 0, received: 0, paidC: 0, payoutC: 0 };
    for (const a of activity) {
      if (a.kind in t) t[a.kind] += Number(a.coins || 0);
      if (a.kind === "buy") t.paidC += Number(a.cents || 0);
      if (a.kind === "withdraw") t.payoutC += Number(a.cents || 0);
    }
    return t;
  }, [activity]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-amber-100 text-amber-600 rounded-3xl">
              <Coins size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-black uppercase italic tracking-tighter">Chat Coins</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                {wallets.length} wallets listed · {coins(totalCoins)} coins held
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search username"
              className="px-4 py-3 rounded-2xl border border-slate-200 text-xs font-bold outline-none focus:border-[#2457D6]" />
            <button onClick={() => setDesc(!desc)} className="px-4 py-3 rounded-2xl bg-slate-900 text-white text-[10px] font-black uppercase">
              Balance {desc ? "↓" : "↑"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex justify-center py-20 text-slate-400"><Loader2 className="animate-spin" /></div>
            ) : shown.length === 0 ? (
              <div className="p-12 text-center text-[11px] font-black uppercase tracking-widest text-slate-400">No wallets.</div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
                {shown.map((w) => {
                  const o = owners[w.name];
                  return (
                    <button key={w.name} onClick={() => open(w.name)}
                      className={`w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-slate-50 ${selected === w.name ? "bg-[#D7E2FF]/40" : ""}`}>
                      <span className="min-w-0">
                        <span className="block text-xs font-black text-slate-800 truncate">@{w.name}</span>
                        <span className="block text-[10px] font-bold text-slate-400 truncate">
                          {o === undefined ? "…" : o.uid ? `Account: ${o.account || o.uid.slice(0, 8)}` : "No owner"}{o?.deleted ? " · deleted" : ""}
                        </span>
                      </span>
                      <span className="text-sm font-black text-amber-600 shrink-0">{coins(w.balance)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="lg:col-span-3 bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6">
            {!selected ? (
              <p className="py-20 text-center text-[11px] font-black uppercase tracking-widest text-slate-400">Pick a wallet to see its coins in and out.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-black">@{selected}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">
                      Balance {coins(wallets.find((w) => w.name === selected)?.balance)} coins
                    </p>
                  </div>
                  {owners[selected]?.uid && (
                    <Link href={`/admin/users/${owners[selected].uid}`} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-black uppercase inline-flex items-center gap-1 hover:bg-slate-200">
                      <User size={12} /> Owner account
                    </Link>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                  <Mini label="Bought" value={`${coins(summary.buy)}`} sub={dollars(summary.paidC)} />
                  <Mini label="Withdrawn" value={`${coins(summary.withdraw)}`} sub={dollars(summary.payoutC)} />
                  <Mini label="Sent" value={coins(summary.sent)} />
                  <Mini label="Received" value={coins(summary.received)} />
                </div>
                {activityLoading ? (
                  <div className="flex justify-center py-10 text-slate-400"><Loader2 className="animate-spin" /></div>
                ) : activity.length === 0 ? (
                  <p className="py-10 text-center text-[11px] font-black uppercase tracking-widest text-slate-400">No coin activity.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {activity.map((a) => {
                      const k = KINDS[a.kind] || { label: a.kind || "Movement", icon: Coins, tone: "bg-slate-100 text-slate-600" };
                      const Icon = k.icon;
                      return (
                        <div key={a.id} className="py-3 flex items-center gap-3">
                          <span className={`p-2 rounded-xl ${k.tone}`}><Icon size={14} /></span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-xs font-black">
                              {k.label}
                              {a.kind === "sent" && a.to ? ` to @${a.to}` : ""}
                              {(a.kind === "received" || a.kind === "moved") && a.from ? ` from @${a.from}` : ""}
                              {a.convoId ? " · in a group" : a.kind === "sent" || a.kind === "received" ? " · in the Chatroom" : ""}
                            </span>
                            <span className="block text-[10px] font-bold text-slate-400">
                              {when(a.createdAt)}
                              {a.kind === "buy" ? ` · paid ${dollars(a.cents)} (fee ${dollars(a.feeCents)})` : ""}
                              {a.kind === "withdraw" ? ` · got ${dollars(a.cents)} (fee ${dollars(a.feeCents)})` : ""}
                            </span>
                          </span>
                          <span className={`text-sm font-black ${["sent", "withdraw"].includes(a.kind) ? "text-rose-600" : "text-emerald-600"}`}>
                            {["sent", "withdraw"].includes(a.kind) ? "−" : "+"}{coins(a.coins)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value, sub }) {
  return (
    <div className="bg-slate-50 rounded-2xl p-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-sm font-black mt-1">{value}</p>
      {sub && <p className="text-[10px] font-bold text-slate-400">{sub}</p>}
    </div>
  );
}
