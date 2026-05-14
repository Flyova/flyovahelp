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
  updateDoc,
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
  RotateCcw,
  MessageSquare,
  X,
  ImageIcon
} from "lucide-react";

export default function AgentTransactions() {
  const [trades, setTrades] = useState([]);
  const [agentNames, setAgentNames] = useState({}); // Stores { agentId: "Name" }
  const [userProfiles, setUserProfiles] = useState({}); // Stores { userId: { name, pin, email } }
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [actionLoading, setActionLoading] = useState(null); 
  const [chatTrade, setChatTrade] = useState(null);
  const [tradeMessages, setTradeMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);

  const PAGE_SIZE = 20;

  const normalizeStatus = (status) => String(status || "").trim().toLowerCase();
  const getDisplayStatus = (trade) => {
    if (trade?.refunded) return "refunded";
    const normalized = normalizeStatus(trade?.status);
    return normalized || "unknown";
  };

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

  // Helper to fetch user profiles for sender IDs
  const fetchUserProfiles = async (userIds) => {
    const uniqueIds = [...new Set(userIds)].filter(id => id && !userProfiles[id]);
    if (uniqueIds.length === 0) return;

    const newProfiles = { ...userProfiles };
    const chunks = [];
    for (let i = 0; i < uniqueIds.length; i += 10) {
      chunks.push(uniqueIds.slice(i, i + 10));
    }

    for (const chunk of chunks) {
      const q = query(collection(db, "users"), where(documentId(), "in", chunk));
      const snap = await getDocs(q);
      snap.forEach(doc => {
        const data = doc.data();
        newProfiles[doc.id] = {
          name: data.fullName || data.username || data.email || "User",
          pin: data.pin || "--------",
          email: data.email || "",
        };
      });
    }
    setUserProfiles(newProfiles);
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
      const senderIds = docs.map(t => t.senderId);
      await fetchAgentNames(agentIds);
      await fetchUserProfiles(senderIds);
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

  useEffect(() => {
    if (!chatTrade?.id) return undefined;
    setChatLoading(true);
    const q = query(collection(db, "trades", chatTrade.id, "messages"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setTradeMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setChatLoading(false);
      },
      (err) => {
        console.error("Trade chat fetch error:", err);
        setTradeMessages([]);
        setChatLoading(false);
      }
    );
    return () => unsub();
  }, [chatTrade?.id]);

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
        const senderIds = newDocs.map(t => t.senderId);
        await fetchAgentNames(agentIds);
        await fetchUserProfiles(senderIds);
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

  // Refund only once
  const handleRefundOnly = async (trade) => {
    if (trade.refunded) {
      alert("This trade has already been refunded.");
      return;
    }
    const targetLabel = trade.type === "deposit" ? "agent balance" : `${trade.senderName || "client"} wallet`;
    if (!window.confirm(`Refund $${(Number(trade.amount) + Number(trade.fee || 0)).toFixed(2)} to ${targetLabel}?`)) return;
    setActionLoading(trade.id + "_ref");
    const batch = writeBatch(db);
    try {
      const totalRefund = Number(trade.amount) + Number(trade.fee || 0);
      const tradeRef = doc(db, "trades", trade.id);

      // Rule:
      // - Deposit refunds go to AGENT balance
      // - Withdrawal refunds go to CLIENT wallet
      if (trade.type === "deposit") {
        const agentRef = doc(db, "agents", trade.agentId);
        const agentSnap = await getDoc(agentRef);
        if (!agentSnap.exists()) {
          alert("Agent profile not found. Cannot process deposit refund.");
          setActionLoading(null);
          return;
        }
        batch.update(agentRef, { agent_balance: increment(totalRefund) });
      } else {
        const userRef = doc(db, "users", trade.senderId);
        batch.update(userRef, { wallet: increment(totalRefund) });

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
      }

      batch.update(tradeRef, { 
        refunded: true, 
        refundedAt: serverTimestamp(),
        refundTarget: trade.type === "deposit" ? "agent" : "client",
        refundAmount: totalRefund
      });

      await batch.commit();
      alert("Refund successful!");
    } catch (err) {
      alert("Refund failed: " + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelTrade = async (trade) => {
    const currentStatus = normalizeStatus(trade?.status);
    if (["completed", "cancelled", "refunded"].includes(currentStatus) || trade?.refunded) {
      alert("This trade can no longer be cancelled.");
      return;
    }
    if (!window.confirm(`Cancel trade ${trade.id}?`)) return;
    setActionLoading(trade.id + "_cancel");
    try {
      await updateDoc(doc(db, "trades", trade.id), {
        status: "cancelled",
        cancelledAt: serverTimestamp(),
        cancelledBy: "admin"
      });
      alert("Trade cancelled.");
    } catch (err) {
      alert("Cancel failed: " + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = trades.filter(t => {
    const term = searchTerm.toLowerCase();
    const name = agentNames[t.agentId] || t.agentName || "";
    const profile = userProfiles[t.senderId] || {};
    const senderName = t.senderName || profile.name || "";
    const senderPin = profile.pin || "";
    const senderEmail = profile.email || "";
    return (
      t.id?.toLowerCase?.().includes(term) || // Transaction ID / Trade ID
      t.senderId?.toLowerCase?.().includes(term) ||
      senderPin.toLowerCase().includes(term) || // Account PIN
      senderEmail.toLowerCase().includes(term) ||
      name.toLowerCase().includes(term) ||
      senderName.toLowerCase().includes(term) ||
      t.type?.toLowerCase().includes(term)
    );
  });

  const getSenderMeta = (msg) => {
    if (!chatTrade) return { name: "Unknown", role: "Unknown", isAgent: false };
    if (msg.senderId === chatTrade.agentId) {
      return {
        name: agentNames[chatTrade.agentId] || chatTrade.agentName || "Agent",
        role: "Agent",
        isAgent: true
      };
    }
    if (msg.senderId === chatTrade.senderId) {
      return {
        name: chatTrade.senderName || userProfiles[chatTrade.senderId]?.name || "Client",
        role: "Client",
        isAgent: false
      };
    }
    return { name: "Unknown User", role: "Unknown", isAgent: false };
  };

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
            placeholder="Search by Trade ID, PIN, email, agent or user..."
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
                    {(() => {
                      const status = getDisplayStatus(trade);
                      const isDone = ["completed", "cancelled", "refunded"].includes(status);
                      const statusClass =
                        status === "completed"
                          ? "bg-emerald-100 text-emerald-600"
                          : status === "pending"
                            ? "bg-orange-100 text-orange-600"
                            : status === "acknowledged"
                              ? "bg-indigo-100 text-indigo-600"
                              : status === "refunded"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-400";

                      return (
                        <>
                    <td className="p-6">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${trade.type === 'deposit' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                          {trade.type === 'deposit' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                        </div>
                        <span className="text-[10px] font-black uppercase italic text-slate-800">{trade.type}</span>
                      </div>
                      <p className="text-[9px] font-mono text-slate-400 mt-1">Trade ID: {trade.id}</p>
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
                        <div>
                          <p className="text-sm font-bold text-slate-600">{trade.senderName || userProfiles[trade.senderId]?.name || "User"}</p>
                          <p className="text-[9px] font-mono text-slate-400">PIN: {userProfiles[trade.senderId]?.pin || "--------"}</p>
                          <p className="text-[9px] text-slate-400">{userProfiles[trade.senderId]?.email || "-"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-6">
                      <p className="text-base font-black italic text-slate-900 tracking-tighter">
                        ${Number(trade.amount || 0).toLocaleString()}
                      </p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Rate: {trade.rate || '---'}</p>
                    </td>
                    <td className="p-6">
                       <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${statusClass}`}>
                         {status}
                       </span>
                       <p className="text-[10px] font-bold text-slate-400 mt-2 flex items-center gap-1 uppercase">
                         <Calendar size={10} /> {trade.createdAt?.toDate ? trade.createdAt.toDate().toLocaleDateString() : '---'}
                       </p>
                    </td>
                    <td className="p-6">
                        <div className="flex items-center justify-end gap-2">
                            <button
                                onClick={() => setChatTrade(trade)}
                                className="flex items-center gap-1 px-3 py-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-500 hover:text-white transition-all border border-indigo-100"
                            >
                                <MessageSquare size={12} />
                                <span className="text-[8px] font-black uppercase tracking-tighter">View Chat</span>
                            </button>
                            {/* YELLOW REFUND BUTTON */}
                            <button 
                                onClick={() => handleRefundOnly(trade)}
                                disabled={actionLoading === trade.id + "_ref" || trade.refunded}
                                className="flex items-center gap-1 px-3 py-2 bg-amber-50 text-amber-600 rounded-xl hover:bg-amber-500 hover:text-white transition-all border border-amber-100"
                            >
                                {actionLoading === trade.id + "_ref" ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                                <span className="text-[8px] font-black uppercase tracking-tighter">{trade.refunded ? "Refunded" : "Refund"}</span>
                            </button>
                            <button
                                onClick={() => handleCancelTrade(trade)}
                                disabled={actionLoading === trade.id + "_cancel" || isDone}
                                className="flex items-center gap-1 px-3 py-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-500 hover:text-white transition-all border border-rose-100 disabled:opacity-40"
                            >
                                {actionLoading === trade.id + "_cancel" ? <Loader2 size={12} className="animate-spin" /> : <ArrowUpRight size={12} />}
                                <span className="text-[8px] font-black uppercase tracking-tighter">Cancel</span>
                            </button>
                        </div>
                    </td>
                        </>
                      );
                    })()}
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

      {chatTrade && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-8">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setChatTrade(null)} />
          <div className="relative z-10 w-full max-w-4xl bg-white rounded-[2rem] border border-slate-200 shadow-2xl overflow-hidden">
            <div className="p-5 md:p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Trade Chat Monitor</p>
                <h3 className="text-lg font-black italic uppercase tracking-tight text-slate-800">
                  Trade ID: {chatTrade.id}
                </h3>
                <p className="text-[11px] font-bold text-slate-500 mt-1">
                  Agent: {agentNames[chatTrade.agentId] || chatTrade.agentName || "Agent"} · Client: {chatTrade.senderName || userProfiles[chatTrade.senderId]?.name || "Client"}
                </p>
              </div>
              <button
                onClick={() => setChatTrade(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-5 md:p-6 bg-slate-50/70 space-y-3">
              {chatLoading ? (
                <div className="h-40 flex items-center justify-center">
                  <Loader2 size={28} className="animate-spin text-indigo-600" />
                </div>
              ) : tradeMessages.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-[11px] font-black uppercase tracking-widest text-slate-400">
                  No chat messages for this trade yet.
                </div>
              ) : (
                tradeMessages.map((msg) => {
                  const sender = getSenderMeta(msg);
                  const msgTime = msg.createdAt?.toDate
                    ? msg.createdAt.toDate().toLocaleString()
                    : "Pending timestamp";
                  return (
                    <div
                      key={msg.id}
                      className={`rounded-2xl p-4 border ${
                        sender.isAgent ? "bg-indigo-50 border-indigo-100" : "bg-white border-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                              sender.isAgent ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {sender.role}
                          </span>
                          <span className="text-[11px] font-black text-slate-700">{sender.name}</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400">{msgTime}</span>
                      </div>

                      {msg.image ? (
                        <a href={msg.image} target="_blank" rel="noreferrer" className="block group">
                          <div className="inline-flex items-center gap-2 text-[11px] font-black text-indigo-600 mb-2">
                            <ImageIcon size={13} /> Image Attachment
                          </div>
                          <img
                            src={msg.image}
                            alt="Trade proof"
                            className="max-h-72 rounded-xl border border-slate-200 group-hover:opacity-90 transition-opacity"
                          />
                        </a>
                      ) : (
                        <p className="text-sm font-bold text-slate-700 leading-relaxed whitespace-pre-wrap">
                          {msg.text || "—"}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
