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
  ShieldAlert
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { 
  doc, 
  onSnapshot, 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  serverTimestamp,
  limit,
  orderBy
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

export default function DepositPage() {
  const router = useRouter();
  const [depositAmount, setDepositAmount] = useState("");
  const [method, setMethod] = useState("usdt");
  const [loading, setLoading] = useState(false);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [userData, setUserData] = useState({ main: 0, country: "", uid: "" });
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  
  // NEW: Global System States
  const [systemSettings, setSystemSettings] = useState(null);
  const [systemLoading, setSystemLoading] = useState(true);
  
  // State for active USDT session
  const [activeUsdtSession, setActiveUsdtSession] = useState(null);

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
              fullName: data.fullName || data.username || "User"
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
      fetchAgents(userData.country, parseFloat(depositAmount) || 0);
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

  const fetchAgents = async (country, amount) => {
    setAgentsLoading(true);
    try {
        const agentQuery = query(
          collection(db, "agents"),
          where("application_status", "==", "approved"),
          where("country", "==", country),
          limit(30)
        );
        
        const agentSnap = await getDocs(agentQuery);
        
        const validAgents = agentSnap.docs.map((agentDoc) => {
            const aData = agentDoc.data();
            const aId = agentDoc.id;
            const businessBalance = Number(aData.agent_balance || 0);

            if (aId === userData.uid || businessBalance < amount) return null;

            return {
                id: aId,
                agent_balance: businessBalance,
                full_name: aData.full_name || "Verified Agent", 
                exchange_rate: Number(aData.deposit_rate || 0),
            };
        }).filter(a => a !== null);

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
    if (amountNum < 10) return alert("Minimum deposit is $10.00");
    
    setLoading(true);
    try {
      if (method === "usdt") {
        // ... (Existing USDT logic remains the same)
        const q = query(
          collection(db, "deposits"),
          where("userId", "==", auth.currentUser.uid),
          where("status", "==", "pending"),
          orderBy("createdAt", "desc"),
          limit(1)
        );

        const snap = await getDocs(q);
        if (!snap.empty) {
          const lastDeposit = snap.docs[0].data();
          const lastTime = lastDeposit.createdAt?.toDate().getTime();
          const now = Date.now();
          
          if (lastTime && (now - lastTime) < 1800000) {
            const minutesLeft = Math.ceil((1800000 - (now - lastTime)) / 60000);
            alert(`You have an active deposit session. Please wait ${minutesLeft} minutes or complete your current payment.`);
            return router.push(`/deposit/direct?id=${snap.docs[0].id}&amount=${lastDeposit.amount}`);
          }
        }

        const docRef = await addDoc(collection(db, "deposits"), {
          userId: auth.currentUser.uid,
          amount: amountNum,
          type: "deposit",
          status: "pending",
          network: "TRC20",
          addressUsed: "TVatYHhNgVriJQwvyzUvo2jYbNqxVKqk1Q",
          createdAt: serverTimestamp(),
        });
        
        router.push(`/deposit/direct?id=${docRef.id}&amount=${amountNum}`);

      } else {
        // --- AGENT DEPOSIT TRIGGER ---
        if (!selectedAgent) return alert("Please select an agent");
        
        const userTradeQ = query(
          collection(db, "trades"), 
          where("senderId", "==", auth.currentUser.uid), 
          where("status", "==", "pending"),
          limit(1)
        );
        const userSnap = await getDocs(userTradeQ);
        if (!userSnap.empty) {
          alert("You already have an active pending trade.");
          setLoading(false);
          return;
        }

        // Fetch Agent's email for notification
        const { getDoc, doc } = await import("firebase/firestore");
        const agentDoc = await getDoc(doc(db, "agents", selectedAgent.id));
        const agentEmail = agentDoc.exists() ? agentDoc.data().email : null;

        const tradeRef = await addDoc(collection(db, "trades"), {
          senderId: auth.currentUser.uid,
          agentId: selectedAgent.id,
          amount: amountNum,
          rate: Number(selectedAgent.exchange_rate),
          type: "deposit",
          status: "pending",
          createdAt: serverTimestamp(),
          senderName: userData.fullName || "User"
        });

        // NOTIFY AGENT OF NEW DEPOSIT REQUEST
        if (agentEmail) {
          try {
            await fetch('/api/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: agentEmail,
                subject: "New Deposit Assignment Received",
                html: `
                  <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; border: 1px solid #ddd; border-radius: 8px;">
                    <h2 style="color: #000; border-bottom: 1px solid #eee; padding-bottom: 10px;">New Deposit Request</h2>
                    <p>Hello ${selectedAgent.full_name},</p>
                    <p>A user has initiated a deposit request to your account.</p>
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0;">
                      <p style="margin: 5px 0;"><strong>User:</strong> ${userData.fullName}</p>
                      <p style="margin: 5px 0;"><strong>Proposed Amount:</strong> $${amountNum}</p>
                      <p style="margin: 5px 0;"><strong>Trade ID:</strong> ${tradeRef.id}</p>
                    </div>
                    <p>Please log in to your agent panel to confirm the transaction once funds are received.</p>
                    <div style="margin-top: 30px; font-size: 11px; color: #777; border-top: 1px solid #eee; padding-top: 15px;">
                      Flyova Agent Network
                    </div>
                  </div>
                `
              })
            });
          } catch (e) {
            console.error("Agent notification failed:", e);
          }
        }
        
        router.push(`/trade/${tradeRef.id}`);
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
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center">
        <Loader2 className="animate-spin text-[#613de6]" size={40} />
      </div>
    );
  }

  // DISABLED STATE VIEW
  if (systemSettings && systemSettings.depositEnabled === false) {
    return (
        <div className="min-h-screen bg-[#0f172a] p-6 flex flex-col items-center justify-center text-center">
            <div className="bg-rose-500/10 p-8 rounded-full mb-8 border border-rose-500/20">
                <ShieldAlert size={60} className="text-rose-500" />
            </div>
            <h2 className="text-3xl font-black italic uppercase text-white mb-3">Deposit Inactive</h2>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-[0.2em] max-w-[280px] leading-relaxed">
                Deposits are temporarily disabled for system maintenance. Please check back shortly.
            </p>
            <button 
              onClick={() => router.push('/dashboard')}
              className="mt-12 bg-[#1e293b] text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/5 active:scale-95 transition-all"
            >
                Back to Dashboard
            </button>
        </div>
    );
  }

  const quickAmounts = [10, 20, 50, 100, 500];

  return (
    <div className="min-h-screen bg-[#0f172a] pb-24 text-white">
      {/* Header */}
      <div className="bg-[#613de6] p-10 pt-16 rounded-b-[3.5rem] shadow-2xl relative overflow-hidden text-center">
        <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12"><Wallet size={120} /></div>
        <p className="relative z-10 text-white/60 text-[10px] font-black uppercase tracking-[0.3em] mb-2">My Balance</p>
        <h1 className="relative z-10 text-5xl font-black italic tracking-tighter">
          <span className="text-[#fc7952] mr-1">$</span>{userData.main.toLocaleString()}
        </h1>
      </div>

      <div className="p-6 max-w-md mx-auto space-y-8">
        
        {/* ACTIVE USDT SESSION NOTICE */}
        {activeUsdtSession && method === "usdt" && (
            <div className="bg-orange-500/10 border border-orange-500/20 p-6 rounded-[2rem] space-y-4 animate-in fade-in slide-in-from-top-4">
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
              className={`p-5 rounded-3xl border flex flex-col items-center gap-2 transition-all ${method === 'usdt' ? 'bg-[#613de6] border-[#613de6]' : 'bg-[#1e293b] border-white/5 opacity-60'}`}>
              <Coins size={22} />
              <span className="text-[10px] font-black uppercase">Direct USDT</span>
            </button>
            <button onClick={() => setMethod("agent")} 
              className={`p-5 rounded-3xl border flex flex-col items-center gap-2 transition-all ${method === 'agent' ? 'bg-[#613de6] border-[#613de6]' : 'bg-[#1e293b] border-white/5 opacity-60'}`}>
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
                className="bg-[#1e293b] py-3 rounded-xl font-black text-xs border border-white/5 active:scale-95 transition-all hover:border-[#613de6]">
                ${amt}
              </button>
            ))}
          </div>
          <div className="relative">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-[#613de6] text-xl">$</span>
            <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="0.00" className="w-full bg-[#1e293b] border border-white/5 p-6 pl-12 rounded-[2rem] font-black text-2xl outline-none focus:border-[#613de6]/50 transition-all" />
          </div>
        </div>

        {method === "agent" && (
          <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
             <div className="flex justify-between items-end px-1">
                <div>
                    <h4 className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Available Merchants</h4>
                    <p className="text-[11px] font-bold text-[#fc7952] flex items-center gap-1 uppercase">
                        <MapPin size={10} /> {userData.country || "Global"}
                    </p>
                </div>
             </div>

             {agentsLoading ? (
                <div className="space-y-3">
                    {[1,2,3].map(i => (
                        <div key={i} className="h-20 bg-[#1e293b] rounded-3xl animate-pulse" />
                    ))}
                </div>
             ) : agents.length > 0 ? (
                <div className="space-y-3">
                    {agents.map((agent) => (
                    <div key={agent.id} onClick={() => setSelectedAgent(agent)}
                        className={`p-5 rounded-3xl border transition-all cursor-pointer flex justify-between items-center group ${selectedAgent?.id === agent.id ? 'bg-[#613de6]/10 border-[#613de6]' : 'bg-[#1e293b] border-white/5 hover:border-white/10'}`}>
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-[#613de6] rounded-2xl flex items-center justify-center font-black italic text-white shadow-lg uppercase">
                                {agent.full_name?.charAt(0)}
                            </div>
                            <div>
                                <p className="text-sm font-black uppercase italic tracking-tight">{agent.full_name}</p>
                                <p className="text-[9px] font-bold text-green-500 uppercase tracking-tighter">Buy Rate: {agent.exchange_rate} / $</p>
                            </div>
                        </div>
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedAgent?.id === agent.id ? 'border-[#613de6] bg-[#613de6]' : 'border-white/10'}`}>
                            {selectedAgent?.id === agent.id && <Check size={12} className="text-white" />}
                        </div>
                    </div>
                    ))}
                </div>
             ) : (
                <div className="bg-[#1e293b] p-8 rounded-3xl border border-dashed border-white/10 text-center">
                    <Users size={30} className="mx-auto mb-2 text-gray-700" />
                    <p className="text-[10px] font-black uppercase text-gray-500">No agent with enough balance in {userData.country}</p>
                </div>
             )}
          </div>
        )}

        <button 
          onClick={handleDeposit} 
          disabled={loading || !depositAmount || (method === 'agent' && !selectedAgent) || (activeUsdtSession && method === "usdt")}
          className="w-full bg-[#613de6] py-5 rounded-[2rem] font-black uppercase italic text-sm shadow-2xl flex items-center justify-center gap-3 disabled:opacity-30 active:scale-95 transition-all"
        >
          {loading ? <Loader2 className="animate-spin" /> : <>PROCEED TO TRADE <ArrowRight size={20}/></>}
        </button>
      </div>
    </div>
  );
}