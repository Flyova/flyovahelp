"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy, 
  limit, 
  startAfter, 
  getDocs,
  doc,
  getDoc,
  documentId,
  where,
  writeBatch,
  increment,
  serverTimestamp,
  deleteDoc
} from "firebase/firestore";
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  Search, 
  User,
  ShieldCheck,
  Loader2,
  ChevronDown,
  Calendar,
  Trash2,
  RotateCcw
} from "lucide-react";

export default function AgentTransactions() {
  const [trades, setTrades] = useState([]);
  const [agentNames, setAgentNames] = useState({}); // Stores { agentId: "Name" }
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [actionLoading, setActionLoading] = useState(null); 

  const PAGE_SIZE = 20;

  // Helper to fetch names for a list of agent IDs
  const fetchAgentNames = async (agentIds) => {
    const uniqueIds = [...new Set(agentIds)].filter(id => id && !agentNames[id]);
    if (uniqueIds.length === 0) return;

    const newNames = { ...agentNames };
    const chunks = [];
    for (let i = 0; i < uniqueIds.length; i += 10) {
      chunks.push(uniqueIds.slice(i, i + 10));
    }

    for (const chunk of chunks) {
      const q = query(collection(db, "agents"), where(documentId(), "in", chunk));
      const snap = await getDocs(q);
      snap.forEach(doc => {
        const data = doc.data();
        newNames[doc.id] = data.full_name || data.fullName || data.username || "Agent";
      });
    }
    setAgentNames(newNames);
  };

  useEffect(() => {
    const q = query(
      collection(db, "trades"),
      orderBy("createdAt", "desc"),
      limit(PAGE_SIZE)
    );
    
    const unsub = onSnapshot(q, async (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const agentIds = docs.map(t => t.agentId);
      await fetchAgentNames(agentIds);
      setTrades(docs);
      setLastDoc(snap.docs[snap.docs.length - 1]);
      setHasMore(snap.docs.length === PAGE_SIZE);
      setLoading(false);
    }, (err) => {
      console.error("Trades Fetch Error:", err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const loadMore = async () => {
    if (!lastDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, "trades"),
        orderBy("createdAt", "desc"),
        startAfter(lastDoc),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const newDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const agentIds = newDocs.map(t => t.agentId);
        await fetchAgentNames(agentIds);
        setTrades(prev => [...prev, ...newDocs]);
        setLastDoc(snap.docs[snap.docs.length - 1]);
        setHasMore(snap.docs.length === PAGE_SIZE);
      } else {
        setHasMore(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  // 1. DELETE ONLY
  const handleDeleteOnly = async (id) => {
    if (!window.confirm("Delete this trade record? This action cannot be undone and will NOT refund the user.")) return;
    setActionLoading(id);
    try {
      await deleteDoc(doc(db, "trades", id));
      alert("Trade record deleted.");
    } catch (err) {
      alert("Delete failed: " + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // 2. REFUND ONLY
  const handleRefundOnly = async (trade) => {
    if (!window.confirm(`Refund $${(Number(trade.amount) + Number(trade.fee || 0)).toFixed(2)} to ${trade.senderName || 'user'}?`)) return;
    setActionLoading(trade.id + "_ref");
    const batch = writeBatch(db);
    try {
      const totalRefund = Number(trade.amount) + Number(trade.fee || 0);
      const userRef = doc(db, "users", trade.senderId);
      batch.update(userRef, { wallet: increment(totalRefund) });

      // Update the user's transaction history log
      const transQ = query(
        collection(db, "users", trade.senderId, "transactions"), 
        where("tradeId", "==", trade.id),
        limit(1)
      );
      const transSnap = await getDocs(transQ);
      if (!transSnap.empty) {
        batch.update(transSnap.docs[0].ref, { 
          status: "refunded", 
          description: "Admin Manual Refund Processed" 
        });
      }

      await batch.commit();
      alert("Refund successful!");
    } catch (err) {
      alert("Refund failed: " + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = trades.filter(t => {
    const name = agentNames[t.agentId] || t.agentName || "";
    return (
      name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.senderName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.type?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black italic uppercase text-slate-800 tracking-tighter">Agent Trade Ledger</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Agent & Merchant History</p>
        </div>
        
        <div className="relative w-full md:w-80">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text"
            placeholder="Search Agent or User..."
            className="w-full bg-white border border-slate-200 pl-12 pr-6 py-3 rounded-2xl text-xs font-bold outline-none focus:ring-2 ring-indigo-500/10 transition-all shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="p-6 text-[10px] font-black uppercase text-slate-400">Activity</th>
                <th className="p-6 text-[10px] font-black uppercase text-slate-400">Agent</th>
                <th className="p-6 text-[10px] font-black uppercase text-slate-400">Client</th>
                <th className="p-6 text-[10px] font-black uppercase text-slate-400">Value</th>
                <th className="p-6 text-[10px] font-black uppercase text-slate-400">Date & Status</th>
                <th className="p-6 text-right text-[10px] font-black uppercase text-slate-400">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan="6" className="p-20 text-center">
                    <Loader2 className="animate-spin text-indigo-600 mx-auto" size={32} />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-20 text-center text-slate-300 font-bold italic uppercase text-[10px] tracking-widest">No trade records found.</td>
                </tr>
              ) : (
                filtered.map((trade) => (
                  <tr key={trade.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-6">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${trade.type === 'deposit' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                          {trade.type === 'deposit' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                        </div>
                        <span className="text-[10px] font-black uppercase italic text-slate-800">{trade.type}</span>
                      </div>
                    </td>
                    <td className="p-6">
                      <div className="flex items-center gap-2">
                        <ShieldCheck size={14} className="text-indigo-600" />
                        <p className="text-sm font-black text-slate-800 italic">
                          {agentNames[trade.agentId] || trade.agentName || "Unknown Agent"}
                        </p>
                      </div>
                    </td>
                    <td className="p-6">
                      <div className="flex items-center gap-2">
                        <User size={14} className="text-slate-400" />
                        <p className="text-sm font-bold text-slate-600">{trade.senderName || "User"}</p>
                      </div>
                    </td>
                    <td className="p-6">
                      <p className="text-base font-black italic text-slate-900 tracking-tighter">
                        ${Number(trade.amount || 0).toLocaleString()}
                      </p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Rate: {trade.rate || '---'}</p>
                    </td>
                    <td className="p-6">
                       <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${
                         trade.status === 'completed' ? 'bg-emerald-100 text-emerald-600' : 
                         trade.status === 'pending' ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-400'
                       }`}>
                         {trade.status || 'unknown'}
                       </span>
                       <p className="text-[10px] font-bold text-slate-400 mt-2 flex items-center gap-1 uppercase">
                         <Calendar size={10} /> {trade.createdAt?.toDate ? trade.createdAt.toDate().toLocaleDateString() : '---'}
                       </p>
                    </td>
                    <td className="p-6">
                        <div className="flex items-center justify-end gap-2">
                            {/* YELLOW REFUND BUTTON */}
                            <button 
                                onClick={() => handleRefundOnly(trade)}
                                disabled={actionLoading === trade.id + "_ref"}
                                className="flex items-center gap-1 px-3 py-2 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-500 hover:text-white transition-all border border-amber-100"
                            >
                                {actionLoading === trade.id + "_ref" ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                                <span className="text-[8px] font-black uppercase tracking-tighter">Refund</span>
                            </button>

                            {/* RED DELETE BUTTON */}
                            <button 
                                onClick={() => handleDeleteOnly(trade.id)}
                                disabled={actionLoading === trade.id}
                                className="flex items-center gap-1 px-3 py-2 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all border border-rose-100"
                            >
                                {actionLoading === trade.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                <span className="text-[8px] font-black uppercase tracking-tighter">Delete</span>
                            </button>
                        </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {hasMore && !loading && (
          <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex justify-center">
            <button 
              onClick={loadMore}
              disabled={loadingMore}
              className="flex items-center gap-2 px-8 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-indigo-600 transition-all shadow-sm"
            >
              {loadingMore ? <Loader2 size={14} className="animate-spin" /> : <>Fetch Older Trades <ChevronDown size={14} /></>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}