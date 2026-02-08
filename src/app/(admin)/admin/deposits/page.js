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
  ExternalLink,
  Copy,
  Image as ImageIcon,
  Link2
} from "lucide-react";

export default function AdminDepositList() {
  const [deposits, setDeposits] = useState([]);
  const [userCache, setUserCache] = useState({}); 
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
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

  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    alert("Hash ID Copied!");
  };

  const handleStatusUpdate = async (deposit, newStatus) => {
    if (!confirm(`Confirm ${newStatus} for this $${deposit.amount} deposit?`)) return;
    
    setProcessingId(deposit.id);
    try {
      const batch = writeBatch(db);
      const depositRef = doc(db, "deposits", deposit.id);
      
      batch.update(depositRef, { 
        status: newStatus, 
        processedAt: serverTimestamp() 
      });

      if (newStatus === "completed") {
        const userRef = doc(db, "users", deposit.userId);
        batch.update(userRef, { 
          wallet: increment(Number(deposit.amount)) 
        });

        const txRef = doc(collection(db, "users", deposit.userId, "transactions"));
        batch.set(txRef, {
          title: "Deposit Approved",
          amount: Number(deposit.amount),
          type: "deposit",
          status: "completed",
          timestamp: serverTimestamp(),
          details: `Direct USDT Deposit`
        });
      }

      await batch.commit();
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
           d.userId?.toLowerCase().includes(search) ||
           d.transactionHash?.toLowerCase().includes(search);
  });

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* IMAGE MODAL */}
      {selectedImage && (
        <div className="fixed inset-0 z-[999] bg-black/95 flex items-center justify-center p-4 backdrop-blur-md">
            <button onClick={() => setSelectedImage(null)} className="absolute top-6 right-6 text-white p-2 bg-white/10 rounded-full">
                <X size={32} />
            </button>
            <img src={selectedImage} alt="Receipt Proof" className="max-w-full max-h-[90vh] rounded-2xl object-contain" />
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black italic uppercase text-slate-800 tracking-tighter">Deposit Center</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Verify Screenshot & TXID</p>
        </div>
        <div className="bg-[#613de6] text-white px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg shadow-[#613de6]/20">
            <Clock size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">{deposits.length} Pending</span>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className="bg-white p-2 md:p-4 rounded-2xl border border-slate-200 shadow-sm relative">
        <Search className="absolute left-6 md:left-8 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input 
          type="text" 
          placeholder="Search User or TXID..." 
          className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:border-[#613de6] font-bold"
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* TABLE / MOBILE LIST CONTAINER */}
      <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="hidden md:table-header-group bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Player</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Amount</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Proof & Hash</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Action</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 block md:table-row-group">
            {loading ? (
                <tr className="block md:table-row"><td colSpan="5" className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-[#fc7952]" /></td></tr>
            ) : filtered.length === 0 ? (
                <tr className="block md:table-row"><td colSpan="5" className="p-12 text-center text-slate-300 font-black italic uppercase text-xs tracking-widest">Empty Workspace</td></tr>
            ) : filtered.map((item) => (
              <tr key={item.id} className="block md:table-row hover:bg-slate-50/50 transition-colors p-4 md:p-0">
                
                {/* PLAYER INFO */}
                <td className="block md:table-cell p-2 md:p-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#613de6]/10 text-[#613de6] rounded-xl flex items-center justify-center font-black italic text-sm">
                        {(userCache[item.userId] || "U").charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <p className="text-sm font-black italic text-slate-800 uppercase leading-none mb-1">
                            {userCache[item.userId] || "Resolving Name..."}
                        </p>
                        <p className="text-[9px] font-mono font-bold text-slate-400 uppercase">ID: {item.userId}</p>
                    </div>
                  </div>
                </td>

                {/* AMOUNT (Visible always) */}
                <td className="block md:table-cell p-2 md:p-6">
                    <div className="flex md:flex-col items-center md:items-start justify-between md:justify-start">
                        <p className="text-xl md:text-base font-black italic text-emerald-600 leading-none mb-1">${item.amount}</p>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded-md">USDT TRC20</p>
                    </div>
                </td>
                
                {/* PROOF & HASH (Mobile Stacked) */}
                <td className="block md:table-cell p-2 md:p-6">
                    <div className="flex flex-col sm:flex-row items-start gap-4 mt-4 md:mt-0">
                        {item.proofImage ? (
                            <div 
                                onClick={() => setSelectedImage(item.proofImage)}
                                className="w-20 h-20 md:w-16 md:h-16 rounded-xl border-2 border-slate-100 overflow-hidden cursor-zoom-in group relative bg-slate-100 flex-shrink-0"
                            >
                                <img src={item.proofImage} alt="Proof" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                    <ImageIcon size={14} className="text-white" />
                                </div>
                            </div>
                        ) : (
                            <div className="w-20 h-20 md:w-16 md:h-16 rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300">
                                <ImageIcon size={20} />
                            </div>
                        )}
                        
                        <div className="w-full overflow-hidden">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Transaction Hash</span>
                                <div className="flex gap-2">
                                    <a 
                                        href={`https://tronscan.org/#/transaction/${item.transactionHash}`} 
                                        target="_blank" 
                                        className="bg-slate-100 p-1.5 rounded-lg text-slate-400 hover:text-[#613de6] transition-colors"
                                    >
                                        <Link2 size={12} />
                                    </a>
                                    <button onClick={() => copyToClipboard(item.transactionHash)} className="bg-slate-100 p-1.5 rounded-lg text-slate-400 hover:text-[#613de6]">
                                        <Copy size={12} />
                                    </button>
                                </div>
                            </div>
                            <p className="text-[10px] font-mono font-black text-slate-500 break-all leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                                {item.transactionHash || "Pending Proof..."}
                            </p>
                        </div>
                    </div>
                </td>

                {/* ACTION BUTTONS (Full width on mobile) */}
                <td className="block md:table-cell p-2 md:p-6">
                    <div className="flex md:justify-center gap-3 mt-4 md:mt-0">
                        <button 
                          onClick={() => handleStatusUpdate(item, 'completed')}
                          disabled={processingId === item.id}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 md:py-2 bg-emerald-500 text-white rounded-2xl hover:bg-emerald-600 transition-all font-black uppercase text-[10px] md:text-[9px] italic shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                        >
                          {processingId === item.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={14} />}
                          Approve
                        </button>
                        <button 
                          onClick={() => handleStatusUpdate(item, 'rejected')}
                          disabled={processingId === item.id}
                          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 md:py-2 bg-rose-50 text-rose-500 rounded-2xl hover:bg-rose-100 transition-all font-black uppercase text-[10px] md:text-[9px] italic"
                        >
                          <X size={14} />
                          Reject
                        </button>
                    </div>
                </td>

                {/* DATE */}
                <td className="block md:table-cell p-2 md:p-6 text-left md:text-right border-t md:border-t-0 mt-4 md:mt-0 border-slate-50 pt-4 md:pt-6">
                    <p className="text-[10px] font-black text-slate-700 uppercase leading-tight">
                        {item.createdAt?.toDate().toLocaleDateString()}
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">
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