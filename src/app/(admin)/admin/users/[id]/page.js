"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { Loader2 } from "lucide-react";

export default function UserActivityPage() {
  const { id } = useParams();
  const [user, setUser] = useState(null);
  const [referrerProfile, setReferrerProfile] = useState(null);
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

        if (selfData.referrerUid) {
          const referrerSnap = await getDoc(doc(db, "users", selfData.referrerUid));
          setReferrerProfile(referrerSnap.exists() ? { id: referrerSnap.id, ...referrerSnap.data() } : null);
        } else {
          setReferrerProfile(null);
        }

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

  const referralLink = useMemo(() => (id ? `https://strawins.com/register?ref=${id}` : ""), [id]);
  const referrerUid = user?.referrerUid;
  const referrerPin = !referrerUid
    ? "N/A"
    : referrerProfile?.id === referrerUid
      ? referrerProfile?.pin || "--------"
      : "--------";

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
          <div>PIN: <span className="font-mono text-[#2457D6]">{user?.pin || "--------"}</span></div>
          <div>Referred By: {user?.referredBy || "N/A"}</div>
          <div className="space-y-1">
            <div>Referrer UID: <span className="font-mono">{user?.referrerUid || "N/A"}</span></div>
            <div>Referrer PIN: <span className="font-mono text-[#2457D6]">{referrerPin}</span></div>
          </div>
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
            {txs.map((tx) => {
              // Rebrand compat: pre-rename records carry "Flyova ..." titles.
              const txTitle = typeof tx.title === "string" && tx.title.startsWith("Flyova ")
                ? tx.title.replace(/^Flyova /, "StraWins ")
                : tx.title;
              const isStraWinsWin     = txTitle === "StraWins Win"            || (tx.type === "win"    && tx.gameId);
              const isStraWinsLoss    = txTitle === "StraWins Loss"           || (tx.type === "loss"   && tx.gameId);
              const isStraWinsPartial = txTitle === "StraWins Partial Refund" || (tx.type === "refund" && tx.gameId);
              const isStraWinsStake   = txTitle === "StraWins Stake";
              const isStraWinsOutcome = isStraWinsWin || isStraWinsLoss || isStraWinsPartial;

              // Show the original stake amount for outcome records
              const amt = Number(tx.amount || 0);
              const stakeAmt = isStraWinsWin ? amt / 1.3 : amt;

              const isDebit  = isStraWinsStake || txTitle === "Match Stake" || tx.type === "stake";
              const isCredit = !isStraWinsOutcome && !isStraWinsStake &&
                               (tx.type === "deposit" || txTitle === "StraWins Win Payout" || tx.direction === "in");

              return (
                <tr key={tx.id}>
                  <td className="p-4 text-xs font-bold text-slate-700">
                    <div>{tx.title || "-"}</div>
                    {tx.picks && <div className="text-[10px] font-mono text-slate-400 mt-0.5">Picks: {tx.picks.join(", ")}</div>}
                  </td>
                  <td className="p-4">
                    {isStraWinsWin ? (
                      <span className="px-2 py-1 rounded-md text-[10px] font-black uppercase bg-emerald-100 text-emerald-700">WIN</span>
                    ) : isStraWinsLoss ? (
                      <span className="px-2 py-1 rounded-md text-[10px] font-black uppercase bg-rose-100 text-rose-700">LOSS</span>
                    ) : isStraWinsPartial ? (
                      <span className="px-2 py-1 rounded-md text-[10px] font-black uppercase bg-amber-100 text-amber-700">PARTIAL</span>
                    ) : isStraWinsStake ? (
                      <span className="px-2 py-1 rounded-md text-[10px] font-black uppercase bg-slate-100 text-slate-600">STAKE</span>
                    ) : (
                      <span className="text-xs font-bold text-slate-500 uppercase">{tx.type || "-"}</span>
                    )}
                  </td>
                  <td className="p-4 text-xs font-black">
                    <span className={isStraWinsOutcome ? "text-slate-800" : isDebit ? "text-rose-600" : isCredit ? "text-emerald-600" : "text-slate-900"}>
                      {isDebit ? "-" : isCredit ? "+" : ""}${Math.abs(isStraWinsOutcome ? stakeAmt : amt).toFixed(2)}
                    </span>
                  </td>
                  <td className="p-4 text-xs font-black uppercase text-slate-500">{tx.status || "-"}</td>
                  <td className="p-4 text-xs font-bold text-slate-500">{tx.timestamp?.toDate ? tx.timestamp.toDate().toLocaleString() : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
