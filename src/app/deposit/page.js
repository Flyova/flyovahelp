"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Wallet, 
  Coins, 
  Check, 
  ArrowRight, 
  UserCheck,
  Loader2,
  MapPin,
  Users,
  Clock,
  ExternalLink,
  ShieldAlert,
  AlertCircle
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { 
  doc, 
  onSnapshot, 
  collection, 
  query, 
  where, 
  getDocs, 
  limit,
  orderBy
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { authFetch } from "@/lib/authFetch";

const DEPOSIT_CLEANUP_STORAGE_KEY = "deposit_cleanup_last_run";
const DEPOSIT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

export default function DepositPage() {
  const router = useRouter();
  const [depositAmount, setDepositAmount] = useState("");
  const [method, setMethod] = useState("usdt");
  const [loading, setLoading] = useState(false);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [userData, setUserData] = useState({ main: 0, country: "", uid: "" });
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // NEW: Global System States
  const [systemSettings, setSystemSettings] = useState(null);
  const [systemLoading, setSystemLoading] = useState(true);
  
  // State for active USDT session
  const [activeUsdtSession, setActiveUsdtSession] = useState(null);

  useEffect(() => {
    // Safety net for deposits whose 30-minute payment window expired while
    // nobody was on the /deposit/direct page to flip them to "cancelled"
    // themselves (tab closed, app backgrounded, etc). Gated the same way as
    // the support chat cleanup trigger so this isn't hit on every page view.
    const now = Date.now();
    const lastRun = Number(localStorage.getItem(DEPOSIT_CLEANUP_STORAGE_KEY) || 0);
    if (now - lastRun >= DEPOSIT_CLEANUP_INTERVAL_MS) {
      fetch("/api/cron/cleanup-expired-deposits")
        .then(() => localStorage.setItem(DEPOSIT_CLEANUP_STORAGE_KEY, String(now)))
        .catch((err) => console.error("Deposit cleanup trigger failed:", err));
    }
  }, []);

  useEffect(() => {
    // NEW: Listen to Global Toggle Settings
    const unsubSettings = onSnapshot(doc(db, "settings", "global"), (snap) => {
      if (snap.exists()) {
        setSystemSettings(snap.data());
      }
      setSystemLoading(false);
    });

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userRef = doc(db, "users", user.uid);
        onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserData({
              main: data.wallet || 0,
              country: data.country || "",
              uid: user.uid,
              fullName: data.fullName || data.username || "User",
              restrictDeposit: data.restrictDeposit || false
            });
          }
        });
        // Check for active USDT deposits on load
        checkActiveUsdtSession(user.uid);
      }
    });
    return () => {
        unsubscribeAuth();
        unsubSettings();
    };
  }, []);

  useEffect(() => {
    if (method === "agent" && userData.country) {
      fetchAgents(parseFloat(depositAmount) || 0);
    }
  }, [depositAmount, method, userData.country]);

  const checkActiveUsdtSession = async (uid) => {
    const q = query(
      collection(db, "deposits"),
      where("userId", "==", uid),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc"),
      limit(1)
    );

    const snap = await getDocs(q);
    if (!snap.empty) {
      const depositDoc = snap.docs[0];
      const deposit = depositDoc.data();
      const createdAt = deposit.createdAt?.toDate().getTime();
      const now = Date.now();
      
      // 30 minutes = 1,800,000 ms
      if (createdAt && (now - createdAt) < 1800000) {
        setActiveUsdtSession({
            id: depositDoc.id,
            ...deposit,
            timeLeft: Math.ceil((1800000 - (now - createdAt)) / 60000)
        });
      }
    }
  };

  const fetchAgents = async (amount) => {
    setAgentsLoading(true);
    try {
        // Agents' records aren't readable by players: the server lists the ones in
        // your country whose balance covers this deposit and its fee.
        const res = await authFetch(`/api/trades?view=agents&type=deposit&amount=${encodeURIComponent(amount || 0)}`);
        if (res.error) throw new Error(res.error);
        const validAgents = res.agents.map((a) => ({ id: a.id, full_name: a.full_name, exchange_rate: a.deposit_rate }));

        setAgents(validAgents);
    } catch (e) {
        console.error("Fetch Error:", e);
    } finally {
        setAgentsLoading(false);
    }
  };

  const handleDeposit = async () => {
    const amountNum = parseFloat(depositAmount);
    if (!depositAmount || amountNum <= 0) return alert("Enter valid amount");
    const min = method === "usdt" ? 10 : 1; // a local agent takes deposits from $1
    if (amountNum < min) return alert(`Minimum deposit is $${min}.00`);
    
    setLoading(true);
    try {
      if (method === "usdt") {
        // One USDT deposit at a time: the server resumes a pending one from the last 30 minutes.
        const res = await authFetch("/api/wallet", { method: "POST", body: { action: "deposit", amount: amountNum } });
        if (res.error) return alert(res.error);
        if (res.existing) alert(`You have an active deposit session. Please wait ${res.minutesLeft} minutes or complete your current payment.`);
        router.push(`/deposit/direct?id=${res.id}&amount=${res.amount}`);
      } else {
        // --- AGENT DEPOSIT TRIGGER ---
        if (!selectedAgent) return alert("Please select an agent");
        // The server checks for an open trade, creates this one and emails the agent.
        const res = await authFetch("/api/trades", { method: "POST", body: { action: "create", type: "deposit", agentId: selectedAgent.id, amount: amountNum } });
        if (res.error) return alert(res.error);
        router.push(`/trade/${res.id}`);
      }
    } catch (e) {
      console.error("GENERAL DEPOSIT ERROR:", e);
      alert("Transaction failed. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  // INITIAL LOAD
  if (systemLoading) {
    return (
      <div className="min-h-screen bg-[#0B1220] flex flex-col items-center justify-center">
        <Loader2 className="animate-spin text-[#2457D6]" size={40} />
      </div>
    );
  }

  // DISABLED STATE VIEW
  if (systemSettings && systemSettings.depositEnabled === false) {
    return (
        <div className="min-h-screen bg-[#0B1220] p-6 flex flex-col items-center justify-center text-center">
            <div className="bg-rose-500/10 p-8 rounded-full mb-8 border border-rose-500/20">
                <ShieldAlert size={60} className="text-rose-500" />
            </div>
            <h2 className="text-3xl font-black italic uppercase text-white mb-3">Deposit Inactive</h2>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-[0.2em] max-w-70 leading-relaxed">
                Deposits are temporarily disabled for system maintenance. Please check back shortly.
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="mt-12 bg-[#142036] text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/5 active:scale-95 transition-all"
            >
                Back to Dashboard
            </button>
        </div>
    );
  }

  // ACCOUNT-LEVEL RESTRICTION VIEW
  if (userData.restrictDeposit) {
    return (
        <div className="min-h-screen bg-[#0B1220] p-6 flex flex-col items-center justify-center text-center">
            <div className="bg-rose-500/10 p-8 rounded-full mb-8 border border-rose-500/20">
                <ShieldAlert size={60} className="text-rose-500" />
            </div>
            <h2 className="text-3xl font-black italic uppercase text-white mb-3">Deposits Restricted</h2>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-[0.2em] max-w-70 leading-relaxed">
                Deposits have been restricted on your account. Please contact support for assistance.
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="mt-12 bg-[#142036] text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/5 active:scale-95 transition-all"
            >
                Back to Dashboard
            </button>
        </div>
    );
  }

  const quickAmounts = [10, 20, 50, 100, 500];

  return (
    <div className="min-h-screen bg-[#0B1220] pb-24 text-white">
      {/* Header */}
      <div className="bg-[#2457D6] p-10 pt-16 rounded-b-[3.5rem] shadow-2xl relative overflow-hidden text-center">
        <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12"><Wallet size={120} /></div>
        <p className="relative z-10 text-white/60 text-[10px] font-black uppercase tracking-[0.3em] mb-2">My Balance</p>
        <h1 className="relative z-10 text-5xl font-black italic tracking-tighter">
          <span className="text-[#8B1E3F] mr-1">$</span>{userData.main.toLocaleString()}
        </h1>
      </div>

      <div className="p-6 max-w-md mx-auto space-y-8">
        
        {/* ACTIVE USDT SESSION NOTICE */}
        {activeUsdtSession && method === "usdt" && (
            <div className="bg-orange-500/10 border border-orange-500/20 p-6 rounded-4xl space-y-4 animate-in fade-in slide-in-from-top-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Clock size={16} className="text-orange-500" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-orange-500">Ongoing Deposit</span>
                    </div>
                    <span className="text-[10px] font-black text-white/40 uppercase">{activeUsdtSession.timeLeft}m Remaining</span>
                </div>
                <p className="text-xs font-bold text-gray-400 leading-relaxed">
                    You have a pending USDT deposit of <span className="text-white">${activeUsdtSession.amount}</span>. You cannot start a new one until this expires or is completed.
                </p>
                <button 
                  onClick={() => router.push(`/deposit/direct?id=${activeUsdtSession.id}&amount=${activeUsdtSession.amount}`)}
                  className="w-full bg-orange-500/20 hover:bg-orange-500/30 py-3 rounded-xl flex items-center justify-center gap-2 text-orange-500 text-[10px] font-black uppercase tracking-widest transition-all"
                >
                    Return to Payment <ExternalLink size={14} />
                </button>
            </div>
        )}

        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase text-gray-500 ml-1 tracking-widest">Deposit Method</p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setMethod("usdt")} 
              className={`p-5 rounded-3xl border flex flex-col items-center gap-2 transition-all ${method === 'usdt' ? 'bg-[#2457D6] border-[#2457D6]' : 'bg-[#142036] border-white/5 opacity-60'}`}>
              <Coins size={22} />
              <span className="text-[10px] font-black uppercase">Direct USDT</span>
            </button>
            <button onClick={() => setMethod("agent")} 
              className={`p-5 rounded-3xl border flex flex-col items-center gap-2 transition-all ${method === 'agent' ? 'bg-[#2457D6] border-[#2457D6]' : 'bg-[#142036] border-white/5 opacity-60'}`}>
              <UserCheck size={22} />
              <span className="text-[10px] font-black uppercase">Local Agent</span>
            </button>
          </div>
        </div>

        {/* Amount Input Section - Disabled if active session exists */}
        <div className={`space-y-4 ${(activeUsdtSession && method === "usdt") ? 'opacity-20 pointer-events-none' : ''}`}>
          <div className="grid grid-cols-3 gap-2">
            {quickAmounts.map((amt) => (
              <button key={amt} onClick={() => setDepositAmount(amt.toString())}
                className="bg-[#142036] py-3 rounded-xl font-black text-xs border border-white/5 active:scale-95 transition-all hover:border-[#2457D6]">
                ${amt}
              </button>
            ))}
          </div>
          <div className="relative">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-[#2457D6] text-xl">$</span>
            <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="0.00" className="w-full bg-[#142036] border border-white/5 p-6 pl-12 rounded-4xl font-black text-2xl outline-none focus:border-[#2457D6]/50 transition-all" />
          </div>
        </div>

        {method === "agent" && (
          <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
             <div className="flex justify-between items-end px-1">
                <div>
                    <h4 className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Available Merchants</h4>
                    <p className="text-[11px] font-bold text-[#8B1E3F] flex items-center gap-1 uppercase">
                        <MapPin size={10} /> {userData.country || "Global"}
                    </p>
                </div>
             </div>

             {agentsLoading ? (
                <div className="space-y-3">
                    {[1,2,3].map(i => (
                        <div key={i} className="h-20 bg-[#142036] rounded-3xl animate-pulse" />
                    ))}
                </div>
             ) : agents.length > 0 ? (
                <div className="space-y-3">
                    {agents.map((agent) => (
                    <div key={agent.id} onClick={() => setSelectedAgent(agent)}
                        className={`p-5 rounded-3xl border transition-all cursor-pointer flex justify-between items-center group ${selectedAgent?.id === agent.id ? 'bg-[#2457D6]/10 border-[#2457D6]' : 'bg-[#142036] border-white/5 hover:border-white/10'}`}>
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-[#2457D6] rounded-2xl flex items-center justify-center font-black italic text-white shadow-lg uppercase">
                                {agent.full_name?.charAt(0)}
                            </div>
                            <div>
                                <p className="text-sm font-black uppercase italic tracking-tight">{agent.full_name}</p>
                                <p className="text-[9px] font-bold text-green-500 uppercase tracking-tighter">Buy Rate: {agent.exchange_rate} / $</p>
                            </div>
                        </div>
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedAgent?.id === agent.id ? 'border-[#2457D6] bg-[#2457D6]' : 'border-white/10'}`}>
                            {selectedAgent?.id === agent.id && <Check size={12} className="text-white" />}
                        </div>
                    </div>
                    ))}
                </div>
             ) : (
                <div className="bg-[#142036] p-8 rounded-3xl border border-dashed border-white/10 text-center">
                    <Users size={30} className="mx-auto mb-2 text-gray-700" />
                    <p className="text-[10px] font-black uppercase text-gray-500">No agent with enough balance in {userData.country}</p>
                </div>
             )}
          </div>
        )}

        <button
          onClick={() => setShowConfirmModal(true)}
          disabled={loading || !depositAmount || (method === 'agent' && !selectedAgent) || (activeUsdtSession && method === "usdt")}
          className="w-full bg-[#2457D6] py-5 rounded-4xl font-black uppercase italic text-sm shadow-2xl flex items-center justify-center gap-3 disabled:opacity-30 active:scale-95 transition-all"
        >
          {loading ? <Loader2 className="animate-spin" /> : <>PROCEED TO TRADE <ArrowRight size={20}/></>}
        </button>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-[#0B1220]/90 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-[#142036] w-full max-w-xs rounded-[2.5rem] border border-white/10 p-8 shadow-2xl space-y-6 text-center">
            <div className="w-16 h-16 bg-[#2457D6]/20 text-[#2457D6] rounded-3xl flex items-center justify-center mx-auto">
              <AlertCircle size={32} />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase italic tracking-tighter mb-2">Confirm Deposit</h2>
              <p className="text-[11px] text-gray-400 font-bold leading-relaxed uppercase">
                You are about to deposit <span className="text-[#8B1E3F]">${depositAmount}</span>. Do not proceed if you&apos;re not ready to deposit.
              </p>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  handleDeposit();
                }}
                disabled={loading}
                className="w-full bg-[#2457D6] py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                {loading ? "Processing..." : "CONFIRM & PAY"}
              </button>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="w-full py-4 rounded-2xl bg-white/5 font-black uppercase text-[10px] tracking-widest text-gray-500"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}