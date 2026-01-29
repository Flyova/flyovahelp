"use client";
import { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc 
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { 
  Check, 
  X, 
  ArrowUpRight, 
  TrendingUp,
  Loader2,
  Edit3,
  RefreshCw,
  User,
  Settings
} from "lucide-react";

export default function AgentDashboard() {
  const router = useRouter();
  const [agent, setAgent] = useState(null);
  const [userData, setUserData] = useState(null);
  const [trades, setTrades] = useState([]);
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);
  const [newRate, setNewRate] = useState("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) return router.push("/login");
      
      const agentRef = doc(db, "agents", u.uid);
      const userRef = doc(db, "users", u.uid);

      onSnapshot(agentRef, (snap) => {
        if (!snap.exists() || snap.data().application_status !== "approved") {
           router.push("/agent/apply");
        }
        setAgent(snap.data());
        setNewRate(snap.data().exchange_rate || "");
      });

      onSnapshot(userRef, (snap) => {
        if (snap.exists()) setUserData(snap.data());
      });

      const q = query(
        collection(db, "trades"),
        where("agentId", "==", u.uid),
        where("status", "==", "pending")
      );

      const unsubTrades = onSnapshot(q, (snap) => {
        setTrades(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, (err) => {
        console.error("Trades listener error:", err.message);
      });

      return () => unsubTrades();
    });
    return () => unsubAuth();
  }, [router]);

  const updateRate = async () => {
    if (!newRate || isNaN(newRate)) return alert("Enter a valid number");
    setUpdating(true);
    try {
      const agentRef = doc(db, "agents", auth.currentUser.uid);
      await updateDoc(agentRef, { exchange_rate: Number(newRate) });
      setIsRateModalOpen(false);
      alert("Exchange rate updated successfully!");
    } catch (e) {
      alert("Error updating rate");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white pb-20">
      {/* Header Section */}
      <div className="bg-[#613de6] p-8 pt-14 rounded-b-[3.5rem] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10">
            <TrendingUp size={120} />
        </div>
        
        <div className="relative z-10 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black italic uppercase tracking-tighter text-white">Agent Dashboard</h1>
                    <p className="text-white/60 text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                       <Check size={12} className="text-green-400" /> Authorized Merchant
                    </p>
                </div>
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20">
                    <User size={24} className="text-white" />
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
                {/* Liquidity Card */}
                <div className="bg-black/20 p-5 rounded-[2.5rem] border border-white/5 flex flex-col justify-between">
                    <div>
                      <p className="text-[9px] font-black uppercase opacity-60 mb-1">Wallet Balance</p>
                      <p className="text-2xl font-black italic text-[#fc7952] leading-tight">${userData?.wallet?.toLocaleString() || "0"}</p>
                    </div>
                </div>
                
                {/* Rate Card (The one from your screenshot) */}
                <div className="bg-black/20 p-5 rounded-[2.5rem] border border-white/5 flex flex-col justify-between min-h-[140px] relative">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[9px] font-black uppercase opacity-60 mb-1">Your Rate</p>
                        <p className="text-2xl font-black italic leading-tight">{agent?.exchange_rate || "0"}<span className="text-[10px] ml-1 opacity-30 italic">/ USD</span></p>
                      </div>
                      <Settings size={14} className="opacity-20" />
                    </div>
                    
                    {/* Action Buttons inside the Rate Card */}
                    <div className="space-y-2 mt-4">
                      <button 
                        onClick={() => setIsRateModalOpen(true)}
                        className="w-full bg-white py-2 rounded-xl text-black text-[9px] font-black uppercase tracking-tighter hover:bg-gray-200 active:scale-95 transition-all shadow-md"
                      >
                        Change Rate
                      </button>
                      <button 
                        onClick={() => router.push("/agent/profile")}
                        className="w-full bg-white/10 py-2 rounded-xl text-white text-[9px] font-black uppercase tracking-tighter border border-white/10 hover:bg-white/20 active:scale-95 transition-all"
                      >
                        Edit Profile
                      </button>
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center px-2">
            <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-500">Live Requests</h2>
            <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="bg-[#613de6]/20 text-[#613de6] text-[10px] px-3 py-1 rounded-full font-black">{trades.length}</span>
            </div>
        </div>

        {trades.length === 0 ? (
            <div className="bg-[#1e293b] p-12 rounded-[2.5rem] border border-dashed border-white/5 text-center shadow-inner">
                <div className="w-16 h-16 bg-[#0f172a] rounded-full flex items-center justify-center mx-auto mb-4 border border-white/5">
                    <Loader2 className="text-gray-700 animate-spin-slow" size={24} />
                </div>
                <p className="text-[10px] font-black uppercase text-gray-500 tracking-widest leading-relaxed opacity-60">Scanning for orders...</p>
            </div>
        ) : (
          <div className="space-y-4">
            {trades.map((trade) => (
              <div key={trade.id} className="bg-[#1e293b] p-6 rounded-[2.5rem] border border-white/5 hover:border-[#613de6]/30 transition-all shadow-xl group">
                <div className="flex justify-between items-center mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-[#613de6]/10 rounded-2xl flex items-center justify-center text-[#613de6] font-black italic border border-[#613de6]/20">
                        {trade.type === 'deposit' ? 'D' : 'W'}
                    </div>
                    <div>
                        <p className={`text-[9px] font-black uppercase tracking-tighter ${trade.type === 'deposit' ? 'text-green-500' : 'text-blue-500'}`}>
                            {trade.type === 'deposit' ? 'Purchase Order' : 'Payout Order'}
                        </p>
                        <p className="text-sm font-black italic uppercase tracking-tight">ID: {trade.id.slice(0, 10)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black text-[#fc7952] leading-none">${trade.amount}</p>
                    <p className="text-[8px] font-bold text-gray-500 uppercase mt-1">Pending</p>
                  </div>
                </div>

                <button 
                  onClick={() => router.push(`/trade/${trade.id}`)}
                  className="w-full bg-[#613de6] py-5 rounded-2xl text-[11px] font-black uppercase italic tracking-widest flex items-center justify-center gap-2 hover:bg-[#704df2] transition-all shadow-lg shadow-[#613de6]/20 group-active:scale-95"
                >
                  Join Trading Room <ArrowUpRight size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* RATE UPDATE MODAL */}
      {isRateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#0f172a]/95 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-[#1e293b] w-full max-w-sm rounded-[3rem] p-8 border border-white/10 shadow-2xl scale-in-center">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black uppercase italic text-sm tracking-wider">Update Rate</h3>
                    <button onClick={() => setIsRateModalOpen(false)} className="p-2 bg-white/5 rounded-xl"><X size={18} /></button>
                </div>
                
                <p className="text-[10px] text-gray-400 font-bold uppercase mb-6 leading-relaxed">
                    Set your exchange rate per 1 USD for all future transactions.
                </p>

                <div className="bg-[#0f172a] p-6 rounded-3xl border border-white/5 mb-8">
                    <label className="text-[9px] font-black uppercase text-[#613de6] block mb-2">New Rate</label>
                    <input 
                        type="number" 
                        value={newRate}
                        onChange={(e) => setNewRate(e.target.value)}
                        placeholder="0"
                        className="w-full bg-transparent font-black text-4xl outline-none text-white placeholder:opacity-20"
                    />
                </div>

                <button 
                    onClick={updateRate}
                    disabled={updating}
                    className="w-full bg-[#fc7952] py-6 rounded-2xl font-black uppercase italic text-xs tracking-widest shadow-xl shadow-[#fc7952]/30 active:scale-95 transition-all flex items-center justify-center gap-2">
                    {updating ? <Loader2 className="animate-spin" /> : "Confirm New Rate"}
                </button>
            </div>
        </div>
      )}
    </div>
  );
}