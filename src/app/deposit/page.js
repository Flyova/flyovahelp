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
  Users
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { 
  doc, 
  onSnapshot, 
  collection, 
  query, 
  where, 
  getDocs, 
  getDoc,
  addDoc, 
  serverTimestamp,
  limit
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

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userRef = doc(db, "users", user.uid);
        onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserData({ 
              main: data.wallet || 0, 
              country: data.country || "",
              uid: user.uid 
            });
          }
        });
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (method === "agent" && userData.country) {
      fetchAgents(userData.country, parseFloat(depositAmount) || 0);
    }
  }, [depositAmount, method, userData.country]);

  // UPDATED: Now checks 'agent_balance' and 'deposit_rate' in the 'agents' collection
  const fetchAgents = async (country, amount) => {
    setAgentsLoading(true);
    try {
        // Step 1: Find approved agents in the 'agents' collection
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
            
            // Logic: Agent must have enough business balance to SELL to the user
            const businessBalance = Number(aData.agent_balance || 0);

            // Exclude self and agents without enough liquidity
            if (aId === userData.uid || businessBalance < amount) return null;

            return {
                id: aId,
                agent_balance: businessBalance,
                full_name: aData.full_name || "Verified Agent", 
                exchange_rate: Number(aData.deposit_rate || 0), // Use specific deposit rate
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
    
    if (method === "usdt") {
      router.push(`/deposit/direct?amount=${depositAmount}`);
    } else {
      if (!selectedAgent) return alert("Please select an agent");
      
      setLoading(true);
      try {
        // Check for active pending trades
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

        // Create Trade with correct rate
        const tradeRef = await addDoc(collection(db, "trades"), {
          senderId: auth.currentUser.uid,
          agentId: selectedAgent.id,
          amount: amountNum,
          rate: Number(selectedAgent.exchange_rate), // This is now the deposit_rate
          type: "deposit",
          status: "pending",
          createdAt: serverTimestamp(),
          senderName: userData.fullName || "User"
        });
        
        router.push(`/trade/${tradeRef.id}`);
      } catch (e) {
        alert("Transaction failed: " + e.message);
      } finally {
        setLoading(false);
      }
    }
  };

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
        {/* Method Toggles */}
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

        {/* Input Area */}
        <div className="space-y-4">
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

        <button onClick={handleDeposit} disabled={loading || !depositAmount || (method === 'agent' && !selectedAgent)}
          className="w-full bg-[#613de6] py-5 rounded-[2rem] font-black uppercase italic text-sm shadow-2xl flex items-center justify-center gap-3 disabled:opacity-30 active:scale-95 transition-all">
          {loading ? <Loader2 className="animate-spin" /> : <>PROCEED TO TRADE <ArrowRight size={20}/></>}
        </button>
      </div>
    </div>
  );
}