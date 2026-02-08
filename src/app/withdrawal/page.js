"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import { 
  doc, 
  onSnapshot, 
  serverTimestamp, 
  collection, 
  addDoc, 
  increment, 
  updateDoc, 
  query, 
  where, 
  getDocs,
  getDoc,
  limit 
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { 
  ChevronLeft, 
  Landmark, 
  Coins, 
  ArrowRight, 
  Wallet, 
  MapPin,
  Loader2,
  Check,
  AlertCircle,
  Receipt,
  ShieldAlert,
  Gift,
  CheckCircle2 // Added for success animation
} from "lucide-react";

export default function WithdrawalPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState({ main: 0, country: "", uid: "", bonusClaimed: false, bonusDeducted: false });
  const [method, setMethod] = useState("bank");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false); // Added for success animation
  const [agentsLoading, setAgentsLoading] = useState(false);
  
  // NEW: Global System States
  const [systemSettings, setSystemSettings] = useState(null);
  const [systemLoading, setSystemLoading] = useState(true);

  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [usdtAddress, setUsdtAddress] = useState("");

  useEffect(() => {
    // NEW: Listen to Global Toggle Settings
    const unsubSettings = onSnapshot(doc(db, "settings", "global"), (snap) => {
      if (snap.exists()) {
        setSystemSettings(snap.data());
      }
      setSystemLoading(false);
    });

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        const userRef = doc(db, "users", u.uid);
        onSnapshot(userRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setUserData({ 
              main: data.wallet || 0, 
              country: data.country || "",
              uid: u.uid,
              fullName: data.fullName || data.username || "User",
              bonusClaimed: data.bonusClaimed || false,
              bonusDeducted: data.bonusDeducted || false
            });
          }
        });
      } else {
        router.push("/login");
      }
    });
    return () => {
      unsubAuth();
      unsubSettings();
    };
  }, [router]);

  useEffect(() => {
    if (method === "bank" && userData.country) {
      const timer = setTimeout(() => {
        fetchAgents(userData.country, parseFloat(amount) || 0);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [amount, method, userData.country]);

  const fetchAgents = async (country, requiredAmount) => {
    setAgentsLoading(true);
    try {
      const q = query(
        collection(db, "agents"),
        where("application_status", "==", "approved"),
        where("country", "==", country),
        limit(30)
      );
      
      const snap = await getDocs(q);
      
      const validAgents = snap.docs.map((agentDoc) => {
        const aData = agentDoc.data();
        const aId = agentDoc.id;
        const businessBalance = Number(aData.agent_balance || 0);

        if (aId === userData.uid) return null;

        return {
          id: aId,
          full_name: aData.full_name || "Active Agent",
          exchange_rate: Number(aData.withdrawal_rate || 0),
          agentBalance: businessBalance 
        };
      }).filter(a => a !== null);

      setAgents(validAgents);

      if (selectedAgent && !validAgents.find(a => a.id === selectedAgent.id)) {
        setSelectedAgent(null);
      }

    } catch (e) {
      console.error("Agent Fetch Error:", e);
    } finally {
      setAgentsLoading(false);
    }
  };

  const calculateWithdrawalFee = (amt) => {
    if (method !== "usdt") return 0.00;
    const a = parseFloat(amt);
    if (!a || a < 10) return 0;
    if (a >= 10001) return 300.00;
    if (a >= 5001) return 170.00;
    if (a >= 3001) return 110.00;
    if (a >= 2001) return 88.00;
    if (a >= 1501) return 75.00;
    if (a >= 1001) return 60.00;
    if (a >= 801) return 52.00;
    if (a >= 701) return 48.00;
    if (a >= 601) return 42.00;
    if (a >= 501) return 35.00;
    if (a >= 401) return 30.00;
    if (a >= 301) return 25.00;
    if (a >= 251) return 22.00;
    if (a >= 201) return 18.00;
    if (a >= 151) return 15.00;
    if (a >= 101) return 12.00;
    if (a >= 81) return 9.00;
    if (a >= 31) return 6.00;
    if (a >= 10) return 3.00;
    return 0.00;
  };

  const isEligibleForBonusDeduction = method === "usdt" && userData.bonusClaimed && !userData.bonusDeducted;
  const bonusDeduction = isEligibleForBonusDeduction ? 3.00 : 0.00;
  
  const currentFee = calculateWithdrawalFee(amount);
  const totalDeductible = (parseFloat(amount) || 0) + currentFee + bonusDeduction;

 const handleWithdraw = async () => {
    const withdrawAmount = parseFloat(amount);
    const fee = calculateWithdrawalFee(withdrawAmount);
    const totalDeduct = withdrawAmount + fee + bonusDeduction;

    if (!withdrawAmount || withdrawAmount <= 0) return alert("Enter a valid amount");
    if (totalDeduct > userData.main) return alert(`Insufficient balance. You need $${totalDeduct.toFixed(2)} total (including fees/bonus recovery).`);
    if (withdrawAmount < 10) return alert("Minimum withdrawal is $10.00");
    if (method === "usdt" && !usdtAddress) return alert("Please enter USDT address");
    if (method === "bank" && !selectedAgent) return alert("Please select an agent");

    setLoading(true);

    try {
      if (method === "usdt") {
        const txData = {
          userId: user.uid,
          amount: withdrawAmount,
          fee: fee,
          bonusRecovered: bonusDeduction,
          totalDeducted: totalDeduct,
          type: "withdrawal",
          status: "pending",
          method: "usdt",
          details: { usdtAddress },
          timestamp: serverTimestamp(),
        };

        if (isEligibleForBonusDeduction) {
          await updateDoc(doc(db, "users", user.uid), { 
            wallet: increment(-totalDeduct),
            bonusDeducted: true
          });
          
          await addDoc(collection(db, "users", user.uid, "transactions"), {
            title: "Bonus Recovery",
            amount: -3.00,
            type: "adjustment",
            status: "completed",
            timestamp: serverTimestamp(),
            details: "Signup bonus recovery"
          });
        } else {
          await updateDoc(doc(db, "users", user.uid), { wallet: increment(-totalDeduct) });
        }

        await addDoc(collection(db, "withdrawals"), txData);
        await addDoc(collection(db, "users", user.uid, "transactions"), {
            ...txData,
            title: "Withdrawal Requested",
            amount: -withdrawAmount 
        });

        // --- NEW: SEND EMAIL NOTIFICATION TO ADMIN ---
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: "arbie1877@gmail.com",
            subject: "🚨 New USDT Withdrawal Request",
            html: `
              <div style="font-family: sans-serif; padding: 20px; color: #333;">
                <h2 style="color: #fc7952;">Withdrawal Alert</h2>
                <p><strong>User:</strong> ${userData.fullName} (${user.uid})</p>
                <p><strong>Amount:</strong> $${withdrawAmount}</p>
                <p><strong>Fee Deducted:</strong> $${fee}</p>
                <p><strong>USDT Address:</strong> <code style="background: #eee; padding: 2px 5px;">${usdtAddress}</code></p>
                <p style="margin-top: 20px; font-size: 12px; color: #888;">Log in to the admin panel to process this payout.</p>
              </div>
            `
          })
        });
        
        setLoading(false);
        setShowSuccess(true);
        setTimeout(() => router.push("/dashboard"), 3000);

      } else {
        const userTradeQ = query(collection(db, "trades"), where("senderId", "==", auth.currentUser.uid), where("status", "==", "pending"), limit(1));
        const userSnap = await getDocs(userTradeQ);
        if (!userSnap.empty) {
          alert("You have an active pending trade.");
          setLoading(false);
          return;
        }

        await updateDoc(doc(db, "users", user.uid), { wallet: increment(-withdrawAmount) });

        const tradeRef = await addDoc(collection(db, "trades"), {
          senderId: auth.currentUser.uid,
          agentId: selectedAgent.id,
          amount: withdrawAmount,
          fee: 0,
          rate: Number(selectedAgent.exchange_rate),
          type: "withdrawal",
          status: "pending",
          createdAt: serverTimestamp(),
          senderName: userData.fullName || "User"
        });

        await addDoc(collection(db, "users", user.uid, "transactions"), {
          amount: -withdrawAmount,
          fee: 0,
          type: "withdrawal",
          method: "agent",
          agentName: selectedAgent.full_name,
          tradeId: tradeRef.id,
          status: "pending",
          timestamp: serverTimestamp()
        });

        // --- NEW: SEND EMAIL NOTIFICATION TO ADMIN FOR AGENT WITHDRAWAL ---
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: "jupiterdigitalagency01@gmail.com",
            subject: "🏦 New Agent Withdrawal Request",
            html: `
              <div style="font-family: sans-serif; padding: 20px; color: #333;">
                <h2 style="color: #613de6;">Agent Trade Initiated</h2>
                <p><strong>User:</strong> ${userData.fullName}</p>
                <p><strong>Amount:</strong> $${withdrawAmount}</p>
                <p><strong>Assigned Agent:</strong> ${selectedAgent.full_name}</p>
                <p><strong>Trade ID:</strong> ${tradeRef.id}</p>
              </div>
            `
          })
        });
        
        setLoading(false);
        setShowSuccess(true);
        setTimeout(() => router.push(`/trade/${tradeRef.id}`), 3000);
      }
    } catch (err) {
      console.error(err);
      alert("Transaction failed.");
      setLoading(false);
    }
  };

  if (systemLoading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center">
        <Loader2 className="animate-spin text-[#613de6]" size={40} />
      </div>
    );
  }

  if (systemSettings && systemSettings.withdrawalEnabled === false) {
    return (
        <div className="min-h-screen bg-[#0f172a] p-6 flex flex-col items-center justify-center text-center">
            <div className="bg-rose-500/10 p-8 rounded-full mb-8 border border-rose-500/20">
                <ShieldAlert size={60} className="text-rose-500" />
            </div>
            <h2 className="text-3xl font-black italic uppercase text-white mb-3">Payouts Offline</h2>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-[0.2em] max-w-[280px] leading-relaxed">
                The withdrawal system is temporarily disabled. Please contact support or check back later.
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

  return (
    <div className="min-h-screen bg-[#0f172a] text-white pb-10 relative">
      
      {/* SUCCESS OVERLAY */}
      {showSuccess && (
        <div className="fixed inset-0 z-[100] bg-[#0f172a]/95 flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-[#1e293b] border border-white/10 p-10 rounded-[3rem] text-center space-y-6 shadow-2xl scale-up-center">
            <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-[0_0_40px_rgba(16,185,129,0.3)]">
              <CheckCircle2 size={40} className="text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black italic uppercase">Withdrawal Submitted!</h2>
              <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mt-1">Redirecting to Dashboard...</p>
            </div>
          </div>
        </div>
      )}

      <div className="p-6 pt-12 flex items-center justify-between bg-[#613de6] rounded-b-[2.5rem] shadow-xl">
        <button onClick={() => router.back()} className="p-2 bg-white/10 rounded-xl"><ChevronLeft size={20} /></button>
        <h1 className="font-black italic uppercase tracking-wider text-xs text-white">Withdraw Funds</h1>
        <div className="w-10" />
      </div>

      <div className="p-6 max-w-md mx-auto space-y-6">
        <div className="bg-[#1e293b] p-6 rounded-[2.5rem] border border-white/5 flex justify-between items-center shadow-2xl">
          <div>
            <p className="text-[10px] font-black opacity-40 uppercase mb-1">Available Balance</p>
            <p className="text-3xl font-black italic text-[#fc7952]">${userData.main.toLocaleString()}</p>
          </div>
          <Wallet size={24} className="text-[#613de6]" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button onClick={() => setMethod("bank")} className={`p-5 rounded-3xl border-2 transition-all ${method === "bank" ? "border-[#613de6] bg-[#613de6]/10 shadow-lg" : "border-white/5 bg-[#1e293b] opacity-60"}`}>
            <div className="relative">
              <Landmark size={24} className="mx-auto mb-2 text-[#613de6]" />
            </div>
            <span className="text-[10px] font-black uppercase block text-center">Local Agent</span>
          </button>
          <button onClick={() => setMethod("usdt")} className={`p-5 rounded-3xl border-2 transition-all ${method === "usdt" ? "border-[#613de6] bg-[#613de6]/10 shadow-lg" : "border-white/5 bg-[#1e293b] opacity-60"}`}>
            <Coins size={24} className="mx-auto mb-2 text-blue-400" />
            <span className="text-[10px] font-black uppercase block text-center">USDT (TRC20)</span>
          </button>
        </div>

        <div className="bg-[#1e293b] p-6 rounded-[2rem] border border-white/5">
          <label className="text-[10px] font-black uppercase opacity-40 block mb-2">Withdrawal Amount ($)</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
            className="w-full bg-transparent font-black text-4xl text-white outline-none" />
        </div>

        {parseFloat(amount) >= 10 && method === "usdt" && (
          <div className="bg-[#613de6]/5 border border-[#613de6]/20 p-5 rounded-3xl space-y-3 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2 mb-1">
               <Receipt size={14} className="text-[#613de6]" />
               <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Transaction Summary</span>
            </div>
            
            <div className="flex justify-between items-center">
               <span className="text-[11px] font-bold text-gray-500">Service Fee</span>
               <span className="text-[11px] font-black text-rose-500">+ ${currentFee.toFixed(2)}</span>
            </div>

            {isEligibleForBonusDeduction && (
              <div className="flex justify-between items-center text-amber-500">
                <span className="text-[11px] font-bold flex items-center gap-1 uppercase tracking-tight">
                    <Gift size={12} /> Bonus Recovery
                </span>
                <span className="text-[11px] font-black">+ $3.00</span>
              </div>
            )}

            <div className="h-px bg-white/5 w-full" />
            <div className="flex justify-between items-center">
               <span className="text-[11px] font-bold text-white">Total Deductible</span>
               <span className="text-lg font-black italic text-[#fc7952]">${totalDeductible.toFixed(2)}</span>
            </div>
            
            {isEligibleForBonusDeduction && (
                <p className="text-[9px] font-bold text-amber-500/60 leading-tight uppercase tracking-tighter pt-1">
                    * The $3.00 signup bonus is deducted from your first USDT withdrawal.
                </p>
            )}
          </div>
        )}

        {method === "bank" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center px-1">
              <h4 className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Qualified Merchants</h4>
              <p className="text-[10px] font-bold text-[#fc7952] flex items-center gap-1 uppercase"><MapPin size={10} /> {userData.country}</p>
            </div>

            {agentsLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin text-[#613de6]" /></div>
            ) : agents.length > 0 ? (
              <div className="space-y-3">
                {agents.map((agent) => (
                  <div key={agent.id} onClick={() => setSelectedAgent(agent)}
                    className={`p-5 rounded-3xl border-2 transition-all cursor-pointer flex justify-between items-center ${selectedAgent?.id === agent.id ? "border-[#613de6] bg-[#613de6]/10 shadow-lg" : "border-white/5 bg-[#1e293b]"}`}>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-[#613de6] rounded-2xl flex items-center justify-center font-black italic text-white shadow-lg uppercase">{agent.full_name.charAt(0)}</div>
                      <div>
                        <p className="font-black uppercase text-sm italic tracking-tight">{agent.full_name}</p>
                        <p className="text-[9px] font-bold text-blue-400 uppercase tracking-tighter">Sell Rate: {agent.exchange_rate} / $</p>
                      </div>
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedAgent?.id === agent.id ? 'border-[#613de6] bg-[#613de6]' : 'border-white/10'}`}>
                      {selectedAgent?.id === agent.id && <Check size={12} className="text-white" />}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-[#1e293b] p-10 rounded-3xl border border-dashed border-white/10 text-center">
                <AlertCircle size={24} className="mx-auto mb-2 text-gray-700" />
                <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest leading-relaxed">No agents found in {userData.country}</p>
              </div>
            )}
          </div>
        )}

        {method === "usdt" && (
            <div className="space-y-3 animate-in fade-in duration-300">
                <p className="text-[10px] font-black uppercase text-gray-500 ml-1">TRC20 Wallet Address</p>
                <input type="text" placeholder="Enter TRC20 Address" value={usdtAddress} onChange={(e) => setUsdtAddress(e.target.value)}
                    className="w-full bg-[#1e293b] border border-white/5 p-5 rounded-2xl text-sm font-bold focus:border-[#613de6] outline-none transition-all placeholder:opacity-20" />
                <p className="text-[9px] font-bold text-rose-500 uppercase flex items-center gap-1"><AlertCircle size={10} /> Double check your address</p>
            </div>
        )}

        <button onClick={handleWithdraw} disabled={loading || !amount || (method === 'bank' && !selectedAgent)}
          className="w-full bg-[#fc7952] py-6 rounded-[2rem] font-black italic uppercase flex items-center justify-center gap-2 shadow-2xl shadow-[#fc7952]/20 disabled:opacity-30 active:scale-95 transition-all text-white">
          {loading ? <Loader2 className="animate-spin" /> : <>PROCEED TO WITHDRAW <ArrowRight size={20} /></>}
        </button>
      </div>

      <style jsx>{`
        .scale-up-center {
          animation: scale-up-center 0.4s cubic-bezier(0.390, 0.575, 0.565, 1.000) both;
        }
        @keyframes scale-up-center {
          0% { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}