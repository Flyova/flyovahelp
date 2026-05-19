"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { Loader2 } from "lucide-react";

export default function UserActivityPage() {
  const { id } = useParams();
  const [user, setUser] = useState(null);
  const [txs, setTxs] = useState([]);
  const [downline, setDownline] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let unsubTx = () => {};

    (async () => {
      const snap = await getDoc(doc(db, "users", id));
      if (snap.exists()) {
        const selfData = { id: snap.id, ...snap.data() };
        setUser(selfData);

        const referralMap = new Map();

        const qPrimary = query(collection(db, "users"), where("referrerUid", "==", id));
        const primarySnap = await getDocs(qPrimary);
        primarySnap.forEach((d) => referralMap.set(d.id, { id: d.id, ...d.data() }));

        const candidates = [selfData.username, selfData.fullName].filter(Boolean);
        for (const label of candidates) {
          const qLegacy = query(collection(db, "users"), where("referredBy", "==", label));
          const legacySnap = await getDocs(qLegacy);
          legacySnap.forEach((d) => referralMap.set(d.id, { id: d.id, ...d.data() }));
        }

        setDownline(Array.from(referralMap.values()));
      }
      const q = query(collection(db, "users", id, "transactions"), orderBy("timestamp", "desc"), limit(300));
      unsubTx = onSnapshot(q, (txSnap) => {
        setTxs(txSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      });
    })();

    return () => unsubTx();
  }, [id]);

  const referralLink = useMemo(() => (id ? `https://flyovahelp.com/register?ref=${id}` : ""), [id]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-600">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-3xl p-6">
        <h1 className="text-2xl font-black italic uppercase text-slate-800">User Activity</h1>
        <p className="text-xs font-bold text-slate-500 mt-2">{user?.fullName || user?.username || "Unknown"} · {user?.email || "No email"}</p>
        <div className="grid md:grid-cols-3 gap-3 mt-4 text-xs font-bold text-slate-600">
          <div>PIN: <span className="font-mono text-indigo-600">{user?.pin || "--------"}</span></div>
          <div>Referred By: {user?.referredBy || "N/A"}</div>
          <div>Referrer UID: {user?.referrerUid || "N/A"}</div>
          <div>Total Referrals: {downline.length}</div>
          <div className="md:col-span-3">Referral Link: <span className="font-mono break-all">{referralLink}</span></div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-6">
        <h2 className="text-lg font-black italic uppercase text-slate-800">Referral List</h2>
        {downline.length === 0 ? (
          <p className="text-xs font-bold text-slate-400 mt-3">No referrals found.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {downline.map((r) => (
              <div key={r.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
                <p className="text-sm font-black text-slate-800">{r.fullName || r.username || "User"}</p>
                <p className="text-[11px] font-mono text-slate-500">{r.id}</p>
                <p className="text-[11px] font-bold text-slate-500">{r.email || "No email"} · PIN: {r.pin || "--------"}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="p-4 text-[10px] font-black uppercase text-slate-500">Title</th>
              <th className="p-4 text-[10px] font-black uppercase text-slate-500">Type</th>
              <th className="p-4 text-[10px] font-black uppercase text-slate-500">Amount</th>
              <th className="p-4 text-[10px] font-black uppercase text-slate-500">Status</th>
              <th className="p-4 text-[10px] font-black uppercase text-slate-500">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {txs.map((tx) => (
              <tr key={tx.id}>
                <td className="p-4 text-xs font-bold text-slate-700">{tx.title || "-"}</td>
                <td className="p-4 text-xs font-bold text-slate-500 uppercase">{tx.type || "-"}</td>
                <td className="p-4 text-xs font-black">
                  {(() => {
                    const isDebit = tx.title === "Flyova Stake" || tx.title === "Match Stake" || tx.type === "stake";
                    const isCredit = tx.type === "win" || tx.type === "deposit" || tx.title === "Flyova Win" || tx.title === "Flyova Win Payout" || tx.title === "Flyova Partial Refund" || tx.direction === "in";
                    const amt = Number(tx.amount || 0);
                    return (
                      <span className={isDebit ? "text-rose-600" : isCredit ? "text-emerald-600" : "text-slate-900"}>
                        {isDebit ? "-" : isCredit ? "+" : ""}${Math.abs(amt).toFixed(2)}
                      </span>
                    );
                  })()}
                </td>
                <td className="p-4 text-xs font-black uppercase text-slate-500">{tx.status || "-"}</td>
                <td className="p-4 text-xs font-bold text-slate-500">{tx.timestamp?.toDate ? tx.timestamp.toDate().toLocaleString() : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
