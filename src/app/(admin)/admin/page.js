"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, onSnapshot, orderBy, limit, doc, getDoc, updateDoc } from "firebase/firestore";
import { resolvePrivilegedRole } from "@/lib/adminAccess";
import { shortGameId } from "@/lib/gameId";
import {
  Users,
  ArrowDownCircle,
  ArrowUpCircle,
  Trophy,
  UserCheck,
  Zap,
  TrendingUp,
  ShieldAlert,
  MessageCircle,
  Wallet,
  Send,
  FileText,
  CheckCircle2
} from "lucide-react";

export default function AdminDashboard() {
  const [accessRole, setAccessRole] = useState(null);
  const [stats, setStats] = useState({
    totalUsers: 0,
    pendingWithdrawals: 0,
    pendingDeposits: 0,
    activeAgents: 0
  });
  const [flyovaResult, setFlyovaResult] = useState({ n1: "--", n2: "--", gameId: "NO ACTIVE" });

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAccessRole(null);
        return;
      }
      try {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          setAccessRole(null);
          return;
        }
        const userData = snap.data();
        const role = resolvePrivilegedRole(userData.role, user.email);
        if (role) {
          setAccessRole(role);
          if (userData.role !== role) updateDoc(userRef, { role }).catch(() => {});
        } else {
          setAccessRole(null);
        }
      } catch {
        setAccessRole(null);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!accessRole) return;

    const unsubUsers = onSnapshot(collection(db, "users"), (s) =>
      setStats((prev) => ({ ...prev, totalUsers: s.size }))
    );

    const qW = query(collection(db, "withdrawals"), where("status", "==", "pending"));
    const unsubW = onSnapshot(qW, (s) => {
      const total = s.docs.reduce((acc, d) => acc + (Number(d.data().amount) || 0), 0);
      setStats((prev) => ({ ...prev, pendingWithdrawals: total }));
    });

    const qD = query(collection(db, "deposits"), where("status", "==", "pending"));
    const unsubD = onSnapshot(qD, (s) => {
      const total = s.docs.reduce((acc, d) => acc + (Number(d.data().amount) || 0), 0);
      setStats((prev) => ({ ...prev, pendingDeposits: total }));
    });

    const qA = query(collection(db, "agents"), where("application_status", "==", "approved"));
    const unsubA = onSnapshot(qA, (s) => setStats((prev) => ({ ...prev, activeAgents: s.size })));

    let unsubFly = null;
    if (accessRole !== "support") {
      const qF = query(collection(db, "timed_games"), where("status", "==", "active"), limit(1));
      unsubFly = onSnapshot(qF, (snap) => {
        if (!snap.empty) {
          const data = snap.docs[0].data();
          setFlyovaResult({
            n1: data.winners?.[0] ?? "--",
            n2: data.winners?.[1] ?? "--",
            gameId: shortGameId(snap.docs[0].id)
          });
        }
      });
    } else {
      setFlyovaResult({ n1: "--", n2: "--", gameId: "RESTRICTED" });
    }

    return () => {
      unsubUsers();
      unsubW();
      unsubD();
      unsubA();
      if (unsubFly) unsubFly();
    };
  }, [accessRole]);

  if (!accessRole) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-[#613de6]/20 flex items-center justify-center mx-auto">
            <Users size={18} className="text-[#a78bfa] animate-pulse" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (accessRole === "support") {
    return (
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black italic uppercase tracking-tighter text-white">Support Dashboard</h1>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Support Operations Console</p>
          </div>
          <div className="flex items-center gap-2 bg-[#0f172a] px-4 py-2 rounded-2xl border border-white/10">
            <ShieldAlert size={14} className="text-amber-400" />
            <span className="text-[10px] font-black uppercase text-slate-300">Flyova Outcomes Restricted</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/admin/agent-tx"
            className="bg-[#0f172a] p-7 rounded-[2rem] border border-white/10 hover:border-[#613de6]/40 transition-all group"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Queue</p>
                <h2 className="text-2xl font-black italic uppercase text-white tracking-tight">Agent Transactions</h2>
                <p className="mt-2 text-xs text-slate-400 font-bold">Track deposits and withdrawals between clients and agents.</p>
              </div>
              <div className="bg-[#613de6]/15 text-[#a78bfa] p-3 rounded-2xl group-hover:scale-105 transition-transform">
                <Wallet size={22} />
              </div>
            </div>
          </Link>

          <Link
            href="/admin/support"
            className="bg-[#0f172a] p-7 rounded-[2rem] border border-white/10 hover:border-[#613de6]/40 transition-all group"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Inbox</p>
                <h2 className="text-2xl font-black italic uppercase text-white tracking-tight">Support</h2>
                <p className="mt-2 text-xs text-slate-400 font-bold">Reply to users and resolve ongoing support tickets.</p>
              </div>
              <div className="bg-[#613de6]/15 text-[#a78bfa] p-3 rounded-2xl group-hover:scale-105 transition-transform">
                <MessageCircle size={22} />
              </div>
            </div>
          </Link>
        </div>
      </div>
    );
  }

  const isStaff = accessRole === "staff";

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black italic uppercase tracking-tighter text-white">
            {isStaff ? "Staff Dashboard" : "Command Center"}
          </h1>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
            {isStaff ? "Content, Announcements & Outcome Monitoring" : "System Overview & Live Performance"}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-[#0f172a] px-4 py-2 rounded-2xl border border-white/10 shadow-sm">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-black uppercase text-slate-300">System Live</span>
        </div>
      </div>

      {isStaff && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <QuickAction href="/admin/agent-tx" label="Agent Transactions" icon={Wallet} />
          <QuickAction href="/admin/broadcast" label="Announcements" icon={Send} />
          <QuickAction href="/admin/testimonials" label="Testimonial Approvals" icon={CheckCircle2} />
          <QuickAction href="/admin/blog" label="Blog Posts" icon={FileText} />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Registered Users" value={stats.totalUsers} icon={Users} color="bg-indigo-600" />
        <StatCard label="Pending Payouts" value={stats.pendingWithdrawals} icon={ArrowUpCircle} color="bg-rose-500" isCurrency />
        <StatCard label="Deposit Requests" value={stats.pendingDeposits} icon={ArrowDownCircle} color="bg-emerald-500" isCurrency />
        <StatCard label="Approved Agents" value={stats.activeAgents} icon={UserCheck} color="bg-amber-500" />
      </div>

      <div className="bg-[#0f172a] p-10 rounded-[3rem] border border-white/10 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-12 opacity-[0.03] rotate-12">
          <Trophy size={200} />
        </div>

        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-yellow-500/15 text-yellow-400 rounded-2xl">
              <Trophy size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black uppercase italic text-white tracking-tight leading-none mb-1">Flyova to Dollars Results</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Game Winning Numbers</p>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-black bg-[#1e293b] px-4 py-2 rounded-xl uppercase text-slate-300 mb-1 border border-white/10">
              Game ID: {flyovaResult.gameId}
            </span>
            <div className="flex items-center gap-1 text-emerald-500 text-[9px] font-bold uppercase">
              <TrendingUp size={12} /> Live Sync
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
          <div className="bg-[#1e293b] p-12 rounded-[2.5rem] border border-white/10 text-center shadow-inner group transition-all hover:border-[#613de6]/40">
            <p className="text-[11px] font-black uppercase text-slate-400 mb-4 tracking-[0.2em]">Primary Winner</p>
            <p className="text-8xl font-black text-[#613de6] italic tracking-tighter drop-shadow-sm group-hover:scale-110 transition-transform">
              {flyovaResult.n1}
            </p>
          </div>
          <div className="bg-[#1e293b] p-12 rounded-[2.5rem] border border-white/10 text-center shadow-inner group transition-all hover:border-[#fc7952]/40">
            <p className="text-[11px] font-black uppercase text-slate-400 mb-4 tracking-[0.2em]">Secondary Winner</p>
            <p className="text-8xl font-black text-[#fc7952] italic tracking-tighter drop-shadow-sm group-hover:scale-110 transition-transform">
              {flyovaResult.n2}
            </p>
          </div>
        </div>

        <div className="mt-10 p-5 bg-[#1e293b] rounded-2xl flex items-center justify-center gap-3 border border-white/10">
          <Zap size={18} className="text-indigo-600 animate-pulse" />
          <p className="text-[11px] font-bold text-indigo-300 uppercase tracking-wide">
            Results are pulled in real-time from the <span className="font-black italic">timed_games</span> winning sequence.
          </p>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ href, label, icon: Icon }) {
  return (
    <Link
      href={href}
      className="bg-[#0f172a] p-5 rounded-3xl border border-white/10 hover:border-[#613de6]/40 transition-all flex items-center gap-3 group"
    >
      <div className="p-2.5 rounded-xl bg-[#613de6]/15 text-[#a78bfa] group-hover:scale-105 transition-transform">
        <Icon size={18} />
      </div>
      <span className="text-[11px] font-black uppercase tracking-wider text-white">{label}</span>
    </Link>
  );
}

function StatCard({ label, value, icon: Icon, color, isCurrency }) {
  return (
    <div className="bg-[#0f172a] p-6 rounded-[2.5rem] border border-white/10 shadow-sm flex items-center gap-5 transition-transform hover:scale-[1.02]">
      <div className={`${color} p-4 rounded-2xl text-white shadow-lg shadow-current/20`}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">{label}</p>
        <p className="text-2xl font-black italic text-white">
          {isCurrency ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : value.toLocaleString()}
        </p>
      </div>
    </div>
  );
}
