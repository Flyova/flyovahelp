"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy,
  doc,
  getDoc,
  updateDoc,
  increment,
  writeBatch,
  serverTimestamp,
  where
} from "firebase/firestore";
import { 
  Search, 
  Loader2, 
  Check, 
  X,
  Clock,
  ArrowUpRight,
  Gift,
  Coins,
  Copy,
  CheckCheck
} from "lucide-react";

export default function AdminWithdrawalList() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [userCache, setUserCache] = useState({}); 
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    const q = query(
      collection(db, "withdrawals"), 
      where("status", "==", "pending"),
      orderBy("timestamp", "desc")
    );
    
    const unsub = onSnapshot(q, async (snap) => {
      const withdrawalDocs = snap.docs.map(d => ({ 
        id: d.id, 
        ...d.data() 
      }));

      const uniqueUserIds = [...new Set(withdrawalDocs.map(d => d.userId))].filter(uid => uid && !userCache[uid]);
      
      if (uniqueUserIds.length > 0) {
        const nameLookups = await Promise.all(uniqueUserIds.map(async (uid) => {
          const userSnap = await getDoc(doc(db, "users", uid));
          return userSnap.exists() ? { uid, name: userSnap.data().fullName } : { uid, name: "Unknown User" };
        }));

        const newNames = {};
        nameLookups.forEach(res => { if(res) newNames[res.uid] = res.name });
        setUserCache(prev => ({ ...prev, ...newNames }));
      }

      setWithdrawals(withdrawalDocs);
      setLoading(false);
    });

    return () => unsub();
  }, [userCache]);

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleStatusUpdate = async (withdrawal, newStatus) => {
    const actionText = newStatus === "approved" ? "Approve" : "Decline & Refund";
    if (!confirm(`${actionText} this $${withdrawal.amount} withdrawal?`)) return;
    
    setProcessingId(withdrawal.id);
    try {
      const batch = writeBatch(db);
      const withdrawalRef = doc(db, "withdrawals", withdrawal.id);
      const userRef = doc(db, "users", withdrawal.userId);
      
      batch.update(withdrawalRef, { 
        status: newStatus, 
        processedAt: serverTimestamp() 
      });

      if (newStatus === "approved") {
        const txRef = doc(collection(db, "users", withdrawal.userId, "transactions"));
        batch.set(txRef, {
          title: "Withdrawal Approved",
          amount: Number(withdrawal.amount),
          type: "withdrawal",
          status: "completed",
          timestamp: serverTimestamp(),
          details: `Payout to ${withdrawal.details?.usdtAddress} confirmed.`
        });

      } else if (newStatus === "declined") {
        const refundAmt = withdrawal.totalDeducted || (withdrawal.amount + (withdrawal.fee || 0));
        
        batch.update(userRef, { 
          wallet: increment(Number(refundAmt)),
          ...(withdrawal.bonusRecovered > 0 && { bonusDeducted: false })
        });

        const txRef = doc(collection(db, "users", withdrawal.userId, "transactions"));
        batch.set(txRef, {
          title: "Withdrawal Refund",
          amount: Number(refundAmt),
          type: "refund",
          status: "completed",
          timestamp: serverTimestamp(),
          details: `Refunded $${refundAmt} due to declined withdrawal.`
        });
      }

      await batch.commit();
      alert(`Withdrawal ${newStatus} successfully!`);
    } catch (error) {
      console.error("Error updating withdrawal:", error);
      alert("Action failed: " + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const filtered = withdrawals.filter(d => {
    const fullName = userCache[d.userId] || "";
    const search = searchTerm.toLowerCase();
    return fullName.toLowerCase().includes(search) || 
           d.userId?.toLowerCase().includes(search) ||
           d.details?.usdtAddress?.toLowerCase().includes(search);
  });

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black italic uppercase text-slate-800 tracking-tighter">Withdrawal Center</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">USDT TRC20 Queue</p>
        </div>
        <div className="bg-[#fc7952] text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-[#fc7952]/20">
            <Clock size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">{withdrawals.length} Pending</span>
        </div>
      </div>

      <div className="bg-white p-2 md:p-4 rounded-2xl border border-slate-200 shadow-sm relative">
        <Search className="absolute left-6 md:left-8 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input 
          type="text" 
          placeholder="Search Player or Wallet Address..." 
          className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:border-[#fc7952] font-bold"
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="hidden md:table-header-group bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">User</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Payout Detail</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Wallet (TRC20)</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Action</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 block md:table-row-group">
            {loading ? (
                <tr className="block md:table-row"><td colSpan="5" className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-[#613de6]" /></td></tr>
            ) : filtered.length === 0 ? (
                <tr className="block md:table-row"><td colSpan="5" className="p-12 text-center text-slate-300 font-black italic uppercase text-xs tracking-widest">Queue Clear</td></tr>
            ) : filtered.map((item) => (
              <tr key={item.id} className="block md:table-row hover:bg-slate-50/50 transition-colors p-4 md:p-0">
                
                {/* USER INFO */}
                <td className="block md:table-cell p-2 md:p-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#fc7952]/10 text-[#fc7952] rounded-xl flex items-center justify-center font-black italic text-sm">
                        {(userCache[item.userId] || "U").charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <p className="text-sm font-black italic text-slate-800 uppercase leading-none mb-1">
                            {userCache[item.userId] || "Resolving..."}
                        </p>
                        <p className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-tighter">ID: {item.userId}</p>
                    </div>
                  </div>
                </td>

                {/* PAYOUT DETAIL */}
                <td className="block md:table-cell p-2 md:p-6">
                    <div className="flex md:flex-col items-center md:items-start justify-between md:justify-start">
                        <div className="flex items-center gap-1 mb-1">
                            <p className="text-xl md:text-base font-black italic text-rose-500 leading-none">${item.amount}</p>
                            <ArrowUpRight size={14} className="text-rose-300" />
                        </div>
                        <div className="flex gap-2">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded-md">Fee: ${item.fee || 0}</p>
                            {item.bonusRecovered > 0 && (
                                <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-md">
                                    <Gift size={10} /> Recov: $3.00
                                </p>
                            )}
                        </div>
                    </div>
                </td>

                {/* WALLET ADDRESS (Full width on mobile) */}
                <td className="block md:table-cell p-2 md:p-6">
                    <div className="mt-3 md:mt-0">
                        <button 
                          onClick={() => copyToClipboard(item.details?.usdtAddress, item.id)}
                          className="group flex items-center gap-3 bg-slate-50 p-4 md:p-2 rounded-xl border border-slate-100 w-full md:max-w-[160px] text-left transition-all hover:border-[#613de6]/30 active:scale-[0.98]"
                        >
                            <Coins size={16} className={`${copiedId === item.id ? 'text-emerald-500' : 'text-blue-400'} shrink-0`} />
                            <p className="text-xs md:text-[10px] font-mono font-black text-slate-600 truncate flex-1">
                                {item.details?.usdtAddress || "MISSING ADDRESS"}
                            </p>
                            <div className="shrink-0 ml-auto bg-white p-1 rounded-md border border-slate-100">
                               {copiedId === item.id ? <CheckCheck size={14} className="text-emerald-500" /> : <Copy size={14} className="text-slate-300 group-hover:text-[#613de6]" />}
                            </div>
                        </button>
                        {copiedId === item.id && <p className="text-[8px] font-black text-emerald-500 uppercase mt-2 ml-1 animate-pulse">Address copied to clipboard</p>}
                    </div>
                </td>

                {/* ACTION BUTTONS */}
                <td className="block md:table-cell p-2 md:p-6">
                    <div className="flex md:justify-center gap-3 mt-4 md:mt-0">
                        <button 
                          onClick={() => handleStatusUpdate(item, 'approved')}
                          disabled={processingId === item.id}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 md:py-2 bg-emerald-500 text-white rounded-2xl hover:bg-emerald-600 transition-all font-black uppercase text-[10px] md:text-[9px] italic shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                        >
                          {processingId === item.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={14} />}
                          Approve
                        </button>
                        <button 
                          onClick={() => handleStatusUpdate(item, 'declined')}
                          disabled={processingId === item.id}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 md:py-2 bg-rose-50 text-rose-500 rounded-2xl hover:bg-rose-100 transition-all font-black uppercase text-[10px] md:text-[9px] italic"
                        >
                          <X size={14} />
                          Decline
                        </button>
                    </div>
                </td>

                {/* DATE */}
                <td className="block md:table-cell p-2 md:p-6 text-left md:text-right border-t md:border-t-0 mt-4 md:mt-0 border-slate-50 pt-4 md:pt-6">
                    <p className="text-[10px] font-black text-slate-700 uppercase leading-tight">
                        {item.timestamp?.toDate().toLocaleDateString()}
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase opacity-60">
                        {item.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                </td>

              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}