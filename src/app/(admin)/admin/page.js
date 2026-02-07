"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  limit 
} from "firebase/firestore";
import { 
  Users, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  Trophy, 
  UserCheck, 
  Zap,
  TrendingUp
} from "lucide-react";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    pendingWithdrawals: 0,
    pendingDeposits: 0,
    activeAgents: 0
  });

  const [flyovaResult, setFlyovaResult] = useState({ n1: "--", n2: "--", gameId: "NO ACTIVE" });

  useEffect(() => {
    // 1. Live Stats Listeners
    const unsubUsers = onSnapshot(collection(db, "users"), (s) => setStats(prev => ({ ...prev, totalUsers: s.size })));
    
    // USDT Pending Withdrawals - Sum of Amounts
    const qW = query(collection(db, "withdrawals"), where("status", "==", "pending"));
    const unsubW = onSnapshot(qW, (s) => {
      const total = s.docs.reduce((acc, doc) => acc + (Number(doc.data().amount) || 0), 0);
      setStats(prev => ({ ...prev, pendingWithdrawals: total }));
    });

    // USDT Pending Deposits - Sum of Amounts
    const qD = query(collection(db, "deposits"), where("status", "==", "pending"));
    const unsubD = onSnapshot(qD, (s) => {
      const total = s.docs.reduce((acc, doc) => acc + (Number(doc.data().amount) || 0), 0);
      setStats(prev => ({ ...prev, pendingDeposits: total }));
    });

    // Active Agents
    const qA = query(collection(db, "agents"), where("application_status", "==", "approved"));
    const unsubA = onSnapshot(qA, (s) => setStats(prev => ({ ...prev, activeAgents: s.size })));

    // 2. Fetch Latest Flyova Winning Numbers from timed_games
    const qF = query(collection(db, "timed_games"), orderBy("createdAt", "desc"), limit(1));
    const unsubFly = onSnapshot(qF, (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data();
        setFlyovaResult({ 
            n1: data.winners?.[0] ?? "--", 
            n2: data.winners?.[1] ?? "--",
            gameId: snap.docs[0].id.slice(-6).toUpperCase()
        });
      }
    });

    return () => { unsubUsers(); unsubW(); unsubD(); unsubA(); unsubFly(); };
  }, []);

  return (
    <div className="space-y-8">
      {/* Top Welcome Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black italic uppercase tracking-tighter text-slate-800">Command Center</h1>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">System Overview & Live Performance</p>
        </div>
        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-black uppercase text-slate-500">System Live</span>
        </div>
      </div>

      {/* STATS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
            label="Registered Users" 
            value={stats.totalUsers} 
            icon={Users} 
            color="bg-indigo-600" 
        />
        <StatCard 
            label="Pending Payouts" 
            value={stats.pendingWithdrawals} 
            icon={ArrowUpCircle} 
            color="bg-rose-500" 
            isCurrency 
        />
        <StatCard 
            label="Deposit Requests" 
            value={stats.pendingDeposits} 
            icon={ArrowDownCircle} 
            color="bg-emerald-500" 
            isCurrency
        />
        <StatCard 
            label="Approved Agents" 
            value={stats.activeAgents} 
            icon={UserCheck} 
            color="bg-amber-500" 
        />
      </div>

      {/* WINNING NUMBERS SECTION */}
      <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-[0.03] rotate-12">
          <Trophy size={200} />
        </div>
        
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-4">
              <div className="p-4 bg-yellow-100 text-yellow-600 rounded-2xl">
                  <Trophy size={24} />
              </div>
              <div>
                  <h3 className="text-xl font-black uppercase italic text-slate-700 tracking-tight leading-none mb-1">Flyova to Dollars Results</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Game Winning Numbers</p>
              </div>
          </div>
          <div className="flex flex-col items-end">
              <span className="text-[10px] font-black bg-slate-100 px-4 py-2 rounded-xl uppercase text-slate-500 mb-1 border border-slate-200">Game ID: {flyovaResult.gameId}</span>
              <div className="flex items-center gap-1 text-emerald-500 text-[9px] font-bold uppercase">
                  <TrendingUp size={12} /> Live Sync
              </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
          <div className="bg-slate-50 p-12 rounded-[2.5rem] border border-slate-100 text-center shadow-inner group transition-all hover:bg-white hover:border-[#613de6]/20">
              <p className="text-[11px] font-black uppercase text-slate-400 mb-4 tracking-[0.2em]">Primary Winner</p>
              <p className="text-8xl font-black text-[#613de6] italic tracking-tighter drop-shadow-sm group-hover:scale-110 transition-transform">
                {flyovaResult.n1}
              </p>
          </div>
          <div className="bg-slate-50 p-12 rounded-[2.5rem] border border-slate-100 text-center shadow-inner group transition-all hover:bg-white hover:border-[#fc7952]/20">
              <p className="text-[11px] font-black uppercase text-slate-400 mb-4 tracking-[0.2em]">Secondary Winner</p>
              <p className="text-8xl font-black text-[#fc7952] italic tracking-tighter drop-shadow-sm group-hover:scale-110 transition-transform">
                {flyovaResult.n2}
              </p>
          </div>
        </div>

        <div className="mt-10 p-5 bg-indigo-50/50 rounded-2xl flex items-center justify-center gap-3 border border-indigo-100/30">
          <Zap size={18} className="text-indigo-600 animate-pulse" />
          <p className="text-[11px] font-bold text-indigo-700 uppercase tracking-wide">
              Results are pulled in real-time from the <span className="font-black italic">timed_games</span> winning sequence.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, isCurrency }) {
  return (
    <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm flex items-center gap-5 transition-transform hover:scale-[1.02]">
      <div className={`${color} p-4 rounded-2xl text-white shadow-lg shadow-current/20`}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">{label}</p>
        <p className="text-2xl font-black italic text-slate-800">
            {isCurrency ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : value.toLocaleString()}
        </p>
      </div>
    </div>
  );
}