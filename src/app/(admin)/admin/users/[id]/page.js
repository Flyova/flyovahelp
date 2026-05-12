"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { Loader2 } from "lucide-react";

export default function UserActivityPage() {
  const { id } = useParams();
  const [user, setUser] = useState(null);
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let unsubTx = () => {};

    (async () => {
      const snap = await getDoc(doc(db, "users", id));
      if (snap.exists()) setUser({ id: snap.id, ...snap.data() });
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
          <div className="md:col-span-3">Referral Link: <span className="font-mono break-all">{referralLink}</span></div>
        </div>
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
                <td className="p-4 text-xs font-black text-slate-900">${Number(tx.amount || 0).toFixed(2)}</td>
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
