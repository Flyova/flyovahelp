"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc, writeBatch } from "firebase/firestore";
import { Bell, CheckCheck, ExternalLink, Flag, Loader2, Lock, Trash2, User, UserCheck, Wallet } from "lucide-react";

// Admin → Alerts: admin_notifications written by the server (lib/notifications):
// flagged accounts, agent trades, unpaid-deposit locks, agent applications and
// confirmed account deletions. Newest first; admins mark them read.

const TYPES = {
  flag: { label: "Flagged", icon: Flag, tone: "bg-red-100 text-red-700" },
  trade: { label: "Agent trade", icon: Wallet, tone: "bg-blue-100 text-[#2457D6]" },
  deposit_lock: { label: "Deposit lock", icon: Lock, tone: "bg-amber-100 text-amber-700" },
  agent_application: { label: "Agent application", icon: UserCheck, tone: "bg-emerald-100 text-emerald-700" },
  deletion: { label: "Deletion", icon: Trash2, tone: "bg-slate-200 text-slate-700" },
};
const typeOf = (t) => TYPES[t] || { label: t || "Alert", icon: Bell, tone: "bg-slate-100 text-slate-600" };
const FILTERS = [["unread", "Unread"], ["all", "All"], ...Object.entries(TYPES).map(([k, v]) => [k, v.label])];

const when = (ts) => (ts?.toDate ? ts.toDate().toLocaleString() : "-");

export default function AdminAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("unread");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "admin_notifications"), orderBy("createdAt", "desc"), limit(300));
    return onSnapshot(q, (snap) => {
      setAlerts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error("Alerts load failed:", err);
      setLoading(false);
    });
  }, []);

  const unread = useMemo(() => alerts.filter((a) => !a.read), [alerts]);
  const shown = useMemo(() => {
    if (filter === "unread") return unread;
    if (filter === "all") return alerts;
    return alerts.filter((a) => a.type === filter);
  }, [alerts, unread, filter]);

  const markRead = async (a, read = true) => {
    try {
      await updateDoc(doc(db, "admin_notifications", a.id), { read });
    } catch (err) {
      alert("Couldn't update the alert: " + err.message);
    }
  };

  const markAllRead = async () => {
    if (!unread.length) return;
    setBusy(true);
    try {
      for (let i = 0; i < unread.length; i += 400) {
        const batch = writeBatch(db);
        unread.slice(i, i + 400).forEach((a) => batch.update(doc(db, "admin_notifications", a.id), { read: true }));
        await batch.commit();
      }
    } catch (err) {
      alert("Couldn't mark them read: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-rose-100 text-rose-600 rounded-3xl">
              <Bell size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-black uppercase italic tracking-tighter">Alerts</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                {unread.length} unread · flags, agent trades, deposit locks, applications, deletions
              </p>
            </div>
          </div>
          <button
            onClick={markAllRead}
            disabled={!unread.length || busy}
            className="px-6 py-4 rounded-2xl bg-[#2457D6] text-white text-[10px] font-black uppercase inline-flex items-center gap-2 disabled:opacity-40 transition-all"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={14} />} Mark all read
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 rounded-full text-[10px] font-black uppercase border transition-all ${filter === key ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-slate-400"}`}
            >
              {label}
              {key === "unread" && unread.length ? ` (${unread.length})` : ""}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20 text-slate-400">
            <Loader2 className="animate-spin" />
          </div>
        ) : shown.length === 0 ? (
          <div className="bg-white rounded-[2rem] border border-slate-100 p-12 text-center text-[11px] font-black uppercase tracking-widest text-slate-400">
            {filter === "unread" ? "All caught up." : "No alerts here."}
          </div>
        ) : (
          <div className="space-y-3">
            {shown.map((a) => {
              const t = typeOf(a.type);
              const Icon = t.icon;
              return (
                <div
                  key={a.id}
                  className={`bg-white rounded-[1.5rem] border p-5 flex flex-col md:flex-row md:items-start gap-4 transition-all ${a.read ? "border-slate-100 opacity-70" : "border-rose-200 shadow-sm"}`}
                >
                  <div className={`p-3 rounded-2xl shrink-0 self-start ${t.tone}`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase ${t.tone}`}>{t.label}</span>
                      {!a.read && <span className="w-2 h-2 rounded-full bg-rose-500" />}
                      <span className="text-[10px] font-bold text-slate-400">{when(a.createdAt)}</span>
                    </div>
                    <p className="text-sm font-black text-slate-800 mt-1">{a.title}</p>
                    {a.body && <p className="text-xs font-bold text-slate-500 mt-1 break-words">{a.body}</p>}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {a.uid && (
                        <Link
                          href={`/admin/users/${a.uid}`}
                          className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-black uppercase inline-flex items-center gap-1 hover:bg-slate-200"
                        >
                          <User size={12} /> Player
                        </Link>
                      )}
                      {a.url?.startsWith("/admin") && (
                        <Link
                          href={a.url}
                          className="px-3 py-2 rounded-xl bg-[#D7E2FF] text-[#2457D6] text-[10px] font-black uppercase inline-flex items-center gap-1 hover:bg-[#2457D6] hover:text-white"
                        >
                          <ExternalLink size={12} /> Open
                        </Link>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => markRead(a, !a.read)}
                    className="self-start px-4 py-2 rounded-xl border border-slate-200 text-[10px] font-black uppercase text-slate-500 hover:bg-slate-900 hover:text-white transition-all whitespace-nowrap"
                  >
                    {a.read ? "Mark unread" : "Mark read"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
