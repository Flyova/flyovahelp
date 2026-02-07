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
  Wallet, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  ArrowDownLeft, 
  Check, 
  X,
  ShieldCheck,
  Clock
} from "lucide-react";

export default function AdminDepositList() {
  const [deposits, setDeposits] = useState([]);
  const [userCache, setUserCache] = useState({}); // Stores { userId: fullName }
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    // ONLY show pending deposits as requested
    const q = query(
      collection(db, "deposits"), 
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );
    
    const unsub = onSnapshot(q, async (snap) => {
      const depositDocs = snap.docs.map(d => ({ 
        id: d.id, 
        ...d.data() 
      }));

      // Resolve Names for users not in cache
      const uniqueUserIds = [...new Set(depositDocs.map(d => d.userId))].filter(uid => uid && !userCache[uid]);
      
      if (uniqueUserIds.length > 0) {
        const nameLookups = await Promise.all(uniqueUserIds.map(async (uid) => {
          const userSnap = await getDoc(doc(db, "users", uid));
          return userSnap.exists() ? { uid, name: userSnap.data().fullName } : { uid, name: "Unknown User" };
        }));

        const newNames = {};
        nameLookups.forEach(res => { if(res) newNames[res.uid] = res.name });
        setUserCache(prev => ({ ...prev, ...newNames }));
      }

      setDeposits(depositDocs);
      setLoading(false);
    });

    return () => unsub();
  }, [userCache]);

  const handleStatusUpdate = async (deposit, newStatus) => {
    if (!confirm(`Confirm ${newStatus} for this $${deposit.amount} deposit?`)) return;
    
    setProcessingId(deposit.id);
    try {
      const batch = writeBatch(db);
      const depositRef = doc(db, "deposits", deposit.id);
      
      // 1. Update main deposit document
      batch.update(depositRef, { 
        status: newStatus, 
        processedAt: serverTimestamp() 
      });

      // 2. If Approved: Credit wallet and create transaction log
      if (newStatus === "completed") {
        const userRef = doc(db, "users", deposit.userId);
        
        // Increment wallet balance
        batch.update(userRef, { 
          wallet: increment(Number(deposit.amount)) 
        });

        // Add to user transaction sub-collection
        const txRef = doc(collection(db, "users", deposit.userId, "transactions"));
        batch.set(txRef, {
          title: "Deposit Approved",
          amount: Number(deposit.amount),
          type: "deposit",
          status: "completed",
          timestamp: serverTimestamp(),
          details: `Direct USDT (${deposit.network || 'TRC20'}) Deposit`
        });
      }

      await batch.commit();
      // The onSnapshot will automatically remove the item from the list because status is no longer 'pending'
    } catch (error) {
      console.error("Error updating deposit:", error);
      alert("Action failed: " + error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const filtered = deposits.filter(d => {
    const fullName = userCache[d.userId] || "";
    const search = searchTerm.toLowerCase();
    return fullName.toLowerCase().includes(search) || 
           d.userId?.toLowerCase().includes(search);
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black italic uppercase text-slate-800">Pending Deposits</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Awaiting Manual Verification</p>
        </div>
        <div className="bg-[#613de6] text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-[#613de6]/20">
            <Clock size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">{deposits.length} Requests</span>
        </div>
      </div>

      {/* SEARCH BOX */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative">
        <Search className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input 
          type="text" 
          placeholder="Filter by name or User ID..." 
          className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:border-[#613de6] font-bold"
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* REQUESTS LIST */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Player</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Amount</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Reference</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Action</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Requested</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
                <tr><td colSpan="5" className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-[#fc7952]" /></td></tr>
            ) : filtered.length === 0 ? (
                <tr><td colSpan="5" className="p-12 text-center text-slate-300 font-black italic uppercase text-xs">No pending deposits found</td></tr>
            ) : filtered.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="p-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-100 text-[#613de6] rounded-xl flex items-center justify-center font-black italic text-sm">
                        {(userCache[item.userId] || "U").charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <p className="text-sm font-black italic text-slate-800 uppercase leading-none mb-1">
                            {userCache[item.userId] || "Resolving Name..."}
                        </p>
                        <p className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-tighter">ID: {item.userId}</p>
                    </div>
                  </div>
                </td>
                <td className="p-6">
                    <p className="text-base font-black italic text-emerald-600 leading-none mb-1">${item.amount}</p>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{item.network || "USDT TRC20"}</p>
                </td>
                <td className="p-6">
                    <div className="flex items-center gap-2">
                        <ArrowDownLeft size={14} className="text-slate-300" />
                        <p className="text-[10px] font-mono font-bold text-slate-500 truncate max-w-[120px]">
                            {item.addressUsed || "Official Wallet"}
                        </p>
                    </div>
                </td>
                <td className="p-6">
                    <div className="flex justify-center gap-3">
                        <button 
                          onClick={() => handleStatusUpdate(item, 'completed')}
                          disabled={processingId === item.id}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-all font-black uppercase text-[9px] italic shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                        >
                          {processingId === item.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          Approve
                        </button>
                        <button 
                          onClick={() => handleStatusUpdate(item, 'rejected')}
                          disabled={processingId === item.id}
                          className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-100 transition-all font-black uppercase text-[9px] italic disabled:opacity-50"
                        >
                          <X size={12} />
                          Reject
                        </button>
                    </div>
                </td>
                <td className="p-6 text-right">
                    <p className="text-[10px] font-black text-slate-700 uppercase leading-tight">
                        {item.createdAt?.toDate().toLocaleDateString()}
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase opacity-60">
                        {item.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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