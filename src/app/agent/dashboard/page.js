"use client";
import { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc,
  increment,
  writeBatch,
  serverTimestamp,
  orderBy,
  limit
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { 
  Check, 
  X, 
  ArrowUpRight, 
  TrendingUp,
  Loader2,
  RefreshCw,
  User,
  Settings,
  Wallet,
  CheckCircle2,
  Plus,
  ArrowRightLeft,
  History,
  Clock
} from "lucide-react";

export default function AgentDashboard() {
  const router = useRouter();
  const [agent, setAgent] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [trades, setTrades] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]);
  
  // Modal States
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);
  const [isTopupModalOpen, setIsTopupModalOpen] = useState(false);
  
  const [rates, setRates] = useState({ deposit: "", withdrawal: "" });
  const [topupAmount, setTopupAmount] = useState("");
  
  const [updating, setUpdating] = useState(false);
  const [topupLoading, setTopupLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) return router.push("/login");
      
      // 1. Listen to Agent Data
      const agentRef = doc(db, "agents", u.uid);
      const unsubAgent = onSnapshot(agentRef, (snap) => {
        if (!snap.exists() || snap.data().application_status !== "approved") {
           router.push("/agent/apply");
        }
        const data = snap.data();
        setAgent(data);
        setRates({ 
          deposit: data.deposit_rate || "", 
          withdrawal: data.withdrawal_rate || "" 
        });
      });

      // 2. Listen to User Data (for main wallet balance)
      const userRef = doc(db, "users", u.uid);
      const unsubUser = onSnapshot(userRef, (snap) => {
        if (snap.exists()) setUserProfile(snap.data());
      });

      // 3. Listen to Active Trades
      const qActive = query(
        collection(db, "trades"),
        where("agentId", "==", u.uid),
        where("status", "in", ["pending", "acknowledged"])
      );
      const unsubActive = onSnapshot(qActive, (snap) => {
        setTrades(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });

      // 4. Listen to Trade History (Recent 10 completed/cancelled)
      const qHistory = query(
        collection(db, "trades"),
        where("agentId", "==", u.uid),
        where("status", "in", ["completed", "cancelled"]),
        orderBy("createdAt", "desc"),
        limit(10)
      );
      const unsubHistory = onSnapshot(qHistory, (snap) => {
        setTradeHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });

      return () => {
        unsubAgent();
        unsubUser();
        unsubActive();
        unsubHistory();
      };
    });
    return () => unsubAuth();
  }, [router]);

  const handleTopup = async () => {
    const amount = Number(topupAmount);
    if (!amount || amount <= 0) return alert("Please enter a valid amount");
    
    if ((userProfile?.wallet || 0) < amount) {
      alert(`Insufficient funds in your main wallet. Current balance: $${userProfile?.wallet?.toLocaleString()}`);
      return;
    }

    setTopupLoading(true);
    try {
      const batch = writeBatch(db);
      const userRef = doc(db, "users", auth.currentUser.uid);
      const agentRef = doc(db, "agents", auth.currentUser.uid);

      batch.update(userRef, { wallet: increment(-amount) });
      batch.update(agentRef, { agent_balance: increment(amount) });

      await batch.commit();
      setIsTopupModalOpen(false);
      setTopupAmount("");
      alert("Topup Successful!");
    } catch (e) {
      alert("Transfer failed: " + e.message);
    } finally {
      setTopupLoading(false);
    }
  };

  const updateRates = async () => {
    if (!rates.deposit || !rates.withdrawal) return alert("Enter valid rates");
    setUpdating(true);
    try {
      const agentRef = doc(db, "agents", auth.currentUser.uid);
      await updateDoc(agentRef, { 
        deposit_rate: Number(rates.deposit),
        withdrawal_rate: Number(rates.withdrawal)
      });
      setIsRateModalOpen(false);
    } catch (e) {
      alert("Error updating rates");
    } finally {
      setUpdating(false);
    }
  };

  const handleAcceptTrade = async (trade) => {
    setActionLoading(trade.id);
    try {
      const batch = writeBatch(db);
      const agentRef = doc(db, "agents", auth.currentUser.uid);
      
      const amount = Number(trade.amount);
      const feePercent = trade.type === "deposit" ? 0.03 : 0.05;
      const totalToLock = amount + (amount * feePercent);

      if (trade.type === "deposit") {
        if ((agent.agent_balance || 0) < totalToLock) {
           alert("Insufficient Agent Balance to cover trade + fee!");
           setActionLoading(null);
           return;
        }
        batch.update(agentRef, { agent_balance: increment(-totalToLock) });
      }

      batch.update(doc(db, "trades", trade.id), { 
        status: "acknowledged", 
        acceptedAt: serverTimestamp(),
        feeCharged: amount * feePercent
      });

      await batch.commit();
    } catch (e) {
      alert("Accept error: " + e.message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white pb-20">
      {/* Header Section */}
      <div className="bg-[#613de6] p-8 pt-14 rounded-b-[3.5rem] shadow-2xl relative overflow-hidden">
        <div className="relative z-10 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black italic uppercase tracking-tighter">Agent Console</h1>
                    <p className="text-white/60 text-[10px] font-black uppercase tracking-widest">Live Trading Dashboard</p>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => router.push('/agent/profile')}
                    className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/10 active:scale-95 flex items-center gap-2 group"
                  >
                    <Settings size={18} className="text-white/70 group-hover:rotate-45 transition-transform" />
                    <span className="text-[9px] font-black uppercase hidden sm:block">Edit Profile</span>
                  </button>
                  <User size={24} className="text-white opacity-40" />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-black/20 p-6 rounded-[2.5rem] border border-white/5 flex flex-col gap-5">
                    <div className="flex items-center gap-5">
                      <div className="bg-[#fc7952]/20 p-3 rounded-2xl">
                        <Wallet className="text-[#fc7952]" size={24} />
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase opacity-60 mb-1">Agent Liquidity Balance</p>
                        <p className="text-3xl font-black italic leading-tight">${agent?.agent_balance?.toLocaleString() || "0"}</p>
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => setIsTopupModalOpen(true)}
                      className="w-full bg-white text-slate-900 py-3.5 rounded-2xl font-black uppercase italic text-[10px] tracking-widest shadow-xl hover:bg-slate-100 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      <Plus size={14} />
                      Topup Balance
                    </button>
                </div>
                
                <div className="bg-black/20 p-6 rounded-[2.5rem] border border-white/5 flex flex-col gap-4">
                    <div className="flex justify-between items-center px-2">
                        <div>
                            <p className="text-[8px] font-black uppercase opacity-90 mb-1">Buying (Depo)</p>
                            <p className="text-xl font-black italic">{agent?.deposit_rate || "0.00"}</p>
                        </div>
                        <div className="w-px h-8 bg-white/10" />
                        <div>
                            <p className="text-[8px] font-black uppercase opacity-90 mb-1">Selling (Withd)</p>
                            <p className="text-xl font-black italic">{agent?.withdrawal_rate || "0.00"}</p>
                        </div>
                    </div>
                    
                    <button 
                      onClick={() => setIsRateModalOpen(true)}
                      className="w-full bg-white text-slate-900 py-3.5 rounded-2xl font-black uppercase italic text-[10px] tracking-widest shadow-xl hover:bg-slate-100 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      <RefreshCw size={14} />
                      Update Market Rates
                    </button>
                </div>
            </div>
        </div>
      </div>

      <div className="p-6 space-y-10">
        {/* Active Orders Section */}
        <section className="space-y-6">
            <div className="flex justify-between items-center px-2">
            <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-500">Active Market Orders</h2>
            <div className="px-3 py-1 bg-[#613de6]/10 rounded-full border border-[#613de6]/20">
                <span className="text-[9px] font-black text-[#613de6] uppercase">{trades.length} Trade{trades.length !== 1 ? 's' : ''}</span>
            </div>
            </div>

            {trades.length === 0 ? (
                <div className="bg-[#1e293b] p-12 rounded-[2.5rem] border border-dashed border-white/5 text-center shadow-inner">
                    <Loader2 className="text-gray-700 animate-spin-slow mx-auto mb-4" size={24} />
                    <p className="text-[10px] font-black uppercase text-gray-500 tracking-widest leading-relaxed opacity-60">No pending orders in your region</p>
                </div>
            ) : (
            <div className="space-y-4">
                {trades.map((trade) => (
                <div key={trade.id} className="bg-[#1e293b] p-6 rounded-[2.5rem] border border-white/5 shadow-xl hover:border-white/10 transition-all">
                    <div className="flex justify-between items-center mb-5">
                    <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black italic border ${trade.type === 'deposit' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20'}`}>
                            {trade.type === 'deposit' ? 'D' : 'W'}
                        </div>
                        <div>
                            <p className="text-sm font-black italic uppercase tracking-tight">{trade.senderName}</p>
                            <p className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">{trade.type === 'deposit' ? 'Wants to Deposit' : 'Wants to Withdraw'}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-xl font-black text-[#fc7952]">${trade.amount}</p>
                        <p className="text-[8px] font-black uppercase opacity-40">Amount</p>
                    </div>
                    </div>

                    {trade.status === 'pending' ? (
                    <div className="flex gap-2">
                        <button 
                        onClick={() => updateDoc(doc(db, "trades", trade.id), { status: "cancelled" })} 
                        className="flex-1 bg-white/5 py-4 rounded-2xl text-[10px] font-black uppercase text-rose-500 border border-white/5 hover:bg-rose-500/5 transition-all"
                        >
                        Decline
                        </button>
                        <button 
                        onClick={() => handleAcceptTrade(trade)} 
                        disabled={actionLoading === trade.id} 
                        className="flex-[2] bg-[#613de6] py-4 rounded-2xl text-[10px] font-black uppercase italic tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-[#613de6]/20 active:scale-95 transition-all"
                        >
                        {actionLoading === trade.id ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />} 
                        Accept Trade
                        </button>
                    </div>
                    ) : (
                    <button 
                        onClick={() => router.push(`/trade/${trade.id}`)} 
                        className="w-full bg-emerald-500 py-4 rounded-2xl text-[10px] font-black uppercase italic tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                    >
                        Go to Chat Room <ArrowUpRight size={16} />
                    </button>
                    )}
                </div>
                ))}
            </div>
            )}
        </section>

        {/* Trade History Section */}
        <section className="space-y-6">
            <div className="flex justify-between items-center px-2">
                <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-500 flex items-center gap-2">
                    <History size={14} /> Recent Trade History
                </h2>
            </div>

            <div className="bg-[#1e293b] rounded-[2.5rem] border border-white/5 overflow-hidden shadow-2xl">
                {tradeHistory.length === 0 ? (
                    <div className="p-10 text-center opacity-40">
                        <Clock className="mx-auto mb-2" size={20} />
                        <p className="text-[9px] font-black uppercase tracking-widest">No history recorded yet</p>
                    </div>
                ) : (
                    <div className="divide-y divide-white/5">
                        {tradeHistory.map((h) => (
                            <div key={h.id} className="p-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black italic ${h.type === 'deposit' ? 'bg-green-500/20 text-green-500' : 'bg-blue-500/20 text-blue-500'}`}>
                                        {h.type === 'deposit' ? 'D' : 'W'}
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-black uppercase tracking-tight">{h.senderName || "User"}</p>
                                        <p className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">
                                            {h.createdAt?.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right flex flex-col items-end gap-1">
                                    <p className="text-xs font-black italic">${h.amount}</p>
                                    <span className={`text-[7px] font-black uppercase px-2 py-0.5 rounded-full ${h.status === 'completed' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-rose-500/20 text-rose-500'}`}>
                                        {h.status}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
      </div>

      {/* TOPUP MODAL */}
      {isTopupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#0f172a]/95 backdrop-blur-md">
            <div className="bg-[#1e293b] w-full max-w-sm rounded-[3rem] p-8 border border-white/10 shadow-2xl animate-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black uppercase italic text-sm tracking-wider">Topup Agent Wallet</h3>
                    <button onClick={() => setIsTopupModalOpen(false)} className="p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-colors"><X size={18} /></button>
                </div>
                
                <div className="bg-[#613de6]/10 p-4 rounded-2xl border border-[#613de6]/20 mb-6 flex justify-between items-center">
                    <span className="text-[9px] font-black uppercase text-white/40">Main Wallet Balance</span>
                    <span className="text-sm font-black text-[#fc7952]">${userProfile?.wallet?.toLocaleString() || "0.00"}</span>
                </div>

                <div className="bg-[#0f172a] p-5 rounded-3xl border border-white/5 mb-8">
                    <label className="text-[9px] font-black uppercase text-[#613de6] block mb-2">Amount to Transfer</label>
                    <div className="relative">
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 text-3xl font-black text-white/20">$</span>
                      <input 
                          type="number" 
                          value={topupAmount} 
                          onChange={(e) => setTopupAmount(e.target.value)} 
                          className="w-full bg-transparent font-black text-3xl outline-none text-white pl-6" 
                          placeholder="0.00" 
                      />
                    </div>
                </div>

                <button 
                  onClick={handleTopup} 
                  disabled={topupLoading} 
                  className="w-full bg-[#613de6] py-6 rounded-2xl font-black uppercase italic text-xs tracking-widest shadow-xl shadow-[#613de6]/30 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                    {topupLoading ? <Loader2 className="animate-spin" /> : <>Transfer Funds <ArrowRightLeft size={16} /></>}
                </button>
            </div>
        </div>
      )}

      {/* RATE MODAL */}
      {isRateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#0f172a]/95 backdrop-blur-md">
            <div className="bg-[#1e293b] w-full max-w-sm rounded-[3rem] p-8 border border-white/10 shadow-2xl animate-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black uppercase italic text-sm tracking-wider">Set Market Pricing</h3>
                    <button onClick={() => setIsRateModalOpen(false)} className="p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-colors"><X size={18} /></button>
                </div>
                
                <div className="space-y-4 mb-8">
                    <div className="bg-[#0f172a] p-5 rounded-3xl border border-white/5">
                        <label className="text-[9px] font-black uppercase text-green-500 block mb-2">Deposit Rate (Buying)</label>
                        <input 
                            type="number" 
                            value={rates.deposit} 
                            onChange={(e) => setRates({...rates, deposit: e.target.value})} 
                            className="w-full bg-transparent font-black text-3xl outline-none text-white" 
                            placeholder="0.00" 
                        />
                    </div>
                    <div className="bg-[#0f172a] p-5 rounded-3xl border border-white/5">
                        <label className="text-[9px] font-black uppercase text-blue-500 block mb-2">Withdrawal Rate (Selling)</label>
                        <input 
                            type="number" 
                            value={rates.withdrawal} 
                            onChange={(e) => setRates({...rates, withdrawal: e.target.value})} 
                            className="w-full bg-transparent font-black text-3xl outline-none text-white" 
                            placeholder="0.00" 
                        />
                    </div>
                </div>

                <button 
                  onClick={updateRates} 
                  disabled={updating} 
                  className="w-full bg-[#fc7952] py-6 rounded-2xl font-black uppercase italic text-xs tracking-widest shadow-xl shadow-[#fc7952]/30 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                    {updating ? <Loader2 className="animate-spin" /> : "Confirm Market Rates"}
                </button>
            </div>
        </div>
      )}
    </div>
  );
}