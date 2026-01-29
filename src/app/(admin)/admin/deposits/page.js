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
  serverTimestamp
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
  ShieldCheck
} from "lucide-react";

export default function AdminDepositList() {
  const [deposits, setDeposits] = useState([]);
  const [userCache, setUserCache] = useState({}); // Stores { userId: fullName }
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    // 1. Listen to the top-level 'deposits' collection
    const q = query(collection(db, "deposits"), orderBy("createdAt", "desc"));
    
    const unsub = onSnapshot(q, async (snap) => {
      const depositDocs = snap.docs.map(d => ({ 
        id: d.id, 
        ...d.data() 
      }));

      // 2. Resolve Names for unique users using the userId field
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
      
      // Update deposit status
      batch.update(depositRef, { 
        status: newStatus, 
        processedAt: serverTimestamp() 
      });

      // If Approved, add money to the user's wallet
      if (newStatus === "completed") {
        const userRef = doc(db, "users", deposit.userId);
        batch.update(userRef, { wallet: increment(deposit.amount) });

        // Create a transaction record in the user's sub-collection
        const txRef = doc(collection(db, "users", deposit.userId, "transactions"));
        batch.set(txRef, {
          title: "USDT Deposit Approved",
          amount: deposit.amount,
          type: "deposit",
          status: "completed",
          timestamp: serverTimestamp(),
          details: `Direct USDT (${deposit.network}) Deposit`
        });
      }

      await batch.commit();
      alert(`Deposit ${newStatus} successfully.`);
    } catch (error) {
      console.error("Error updating deposit:", error);
      alert("Action failed.");
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
          <h1 className="text-2xl font-black italic uppercase text-slate-800">Deposit Requests</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Confirming USDT TRC20 Payments</p>
        </div>
        <div className="bg-[#fc7952] text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-[#fc7952]/20">
            <Wallet size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">Cash Inflow</span>
        </div>
      </div>

      {/* SEARCH */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative">
        <Search className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input 
          type="text" 
          placeholder="Search Player Full Name or User ID..." 
          className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:border-[#613de6]"
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Player</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Amount & Network</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Address Used</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Actions</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
                <tr><td colSpan="5" className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-[#fc7952]" /></td></tr>
            ) : filtered.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="p-6">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-slate-100 text-[#fc7952] rounded-xl flex items-center justify-center font-black italic text-xs">
                        {(userCache[item.userId] || "U").charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <p className="text-sm font-black italic text-slate-800 uppercase leading-none mb-1">
                            {userCache[item.userId] || "Resolving Name..."}
                        </p>
                        <p className="text-[9px] font-mono text-slate-400 uppercase">ID: {item.userId}</p>
                    </div>
                  </div>
                </td>
                <td className="p-6">
                    <p className="text-sm font-black italic text-emerald-600 leading-none mb-1">+${item.amount}</p>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{item.network || "TRC20"}</p>
                </td>
                <td className="p-6">
                    <div className="flex items-center gap-2">
                        <ArrowDownLeft size={14} className="text-emerald-500" />
                        <p className="text-[10px] font-mono font-bold text-slate-600 break-all">
                            {item.addressUsed || "Default Address"}
                        </p>
                    </div>
                </td>
                <td className="p-6">
                    <div className="flex justify-center gap-2">
                        {item.status === 'pending' ? (
                          <>
                            <button 
                              onClick={() => handleStatusUpdate(item, 'completed')}
                              disabled={processingId === item.id}
                              className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors"
                            >
                              {processingId === item.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                            </button>
                            <button 
                              onClick={() => handleStatusUpdate(item, 'rejected')}
                              disabled={processingId === item.id}
                              className="p-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-colors"
                            >
                              <X size={16} />
                            </button>
                          </>
                        ) : (
                          <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${
                              item.status === 'completed' ? 'bg-green-100 text-green-600' : 'bg-rose-100 text-rose-600'
                          }`}>
                              {item.status === 'completed' ? <ShieldCheck size={12}/> : <XCircle size={12}/>}
                              {item.status}
                          </span>
                        )}
                    </div>
                </td>
                <td className="p-6 text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase leading-tight">
                        {item.createdAt?.toDate().toLocaleDateString()}<br/>
                        <span className="text-[8px] opacity-60">{item.createdAt?.toDate().toLocaleTimeString()}</span>
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