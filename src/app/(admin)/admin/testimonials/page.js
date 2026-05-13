"use client";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";
import { CheckCircle2, Loader2, Search, XCircle } from "lucide-react";

function statusBadge(item) {
  if (item.approved === true) return { text: "Approved", tone: "bg-emerald-100 text-emerald-700" };
  if (item.rejected === true) return { text: "Rejected", tone: "bg-rose-100 text-rose-700" };
  return { text: "Pending", tone: "bg-amber-100 text-amber-700" };
}

function formatDate(ts) {
  if (!ts?.toDate) return "—";
  return ts.toDate().toLocaleString();
}

export default function AdminTestimonialApprovals() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    const q = query(collection(db, "withdrawal_testimonials"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, async (snap) => {
      const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Backfill missing country/amount from user profile where possible.
      const hydrated = await Promise.all(
        raw.map(async (item) => {
          if (item.country && item.amount) return item;
          if (!item.userId) return item;
          try {
            const userSnap = await getDoc(doc(db, "users", item.userId));
            if (!userSnap.exists()) return item;
            const userData = userSnap.data();
            return {
              ...item,
              country: item.country || userData.country || "Unknown Country"
            };
          } catch {
            return item;
          }
        })
      );

      setItems(hydrated);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const needle = search.toLowerCase().trim();
    if (!needle) return items;
    return items.filter((item) => {
      const line = `${item.userName || ""} ${item.amount || ""} ${item.country || ""} ${item.message || ""}`.toLowerCase();
      return line.includes(needle);
    });
  }, [items, search]);

  const review = async (item, mode) => {
    setProcessingId(item.id);
    try {
      const ref = doc(db, "withdrawal_testimonials", item.id);
      await updateDoc(ref, {
        approved: mode === "approve",
        rejected: mode === "reject",
        reviewedBy: auth.currentUser?.uid || "system",
        reviewedAt: serverTimestamp()
      });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black italic uppercase tracking-tighter text-white">Testimonial Approvals</h1>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
            Review withdrawal testimonials before public display
          </p>
        </div>
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search username, country, amount..."
            className="w-full bg-[#0f172a] border border-white/10 rounded-2xl py-3 pl-11 pr-4 text-sm font-bold text-white placeholder:text-slate-500 outline-none focus:border-[#613de6]/50"
          />
        </div>
      </div>

      <div className="bg-[#0f172a] rounded-[2rem] border border-white/10 overflow-hidden">
        {loading ? (
          <div className="h-52 flex items-center justify-center">
            <Loader2 size={28} className="animate-spin text-[#613de6]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="h-52 flex items-center justify-center text-slate-400 text-xs font-black uppercase tracking-widest">
            No testimonials found
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map((item) => {
              const badge = statusBadge(item);
              const username = item.userName || "Anonymous";
              const amount = Number(item.amount || 0);
              const country = item.country || "Unknown Country";
              const summary = `@${username} withdrew $${amount.toLocaleString()} from ${country}`;
              return (
                <div key={item.id} className="p-5 md:p-6 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-white">{summary}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1">
                        Submitted: {formatDate(item.timestamp)}
                      </p>
                    </div>
                    <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${badge.tone}`}>
                      {badge.text}
                    </span>
                  </div>

                  <div className="bg-black/20 border border-white/5 rounded-2xl p-4">
                    <p className="text-[11px] font-bold text-slate-300 leading-relaxed">{item.message || "No message provided."}</p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                    <button
                      onClick={() => review(item, "approve")}
                      disabled={processingId === item.id}
                      className="px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {processingId === item.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      Approve
                    </button>
                    <button
                      onClick={() => review(item, "reject")}
                      disabled={processingId === item.id}
                      className="px-4 py-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <XCircle size={14} />
                      Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

