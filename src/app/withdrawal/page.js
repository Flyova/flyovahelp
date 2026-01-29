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
  AlertCircle
} from "lucide-react";

export default function WithdrawalPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState({ main: 0, country: "", uid: "" });
  const [method, setMethod] = useState("bank");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [agentsLoading, setAgentsLoading] = useState(false);
  
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [usdtAddress, setUsdtAddress] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        const userRef = doc(db, "users", u.uid);
        onSnapshot(userRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setUserData({ 
              main: data.wallet || 0, 
              country: data.country || "",
              uid: u.uid 
            });
          }
        });
      } else {
        router.push("/login");
      }
    });
    return () => unsub();
  }, [router]);

  // RE-FETCH AGENTS: Triggered every time the amount or country changes
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
        collection(db, "users"),
        where("isAgent", "==", true),
        where("country", "==", country),
        limit(30)
      );
      
      const snap = await getDocs(q);
      
      const agentPromises = snap.docs.map(async (userDoc) => {
        const uData = userDoc.data();
        const uId = userDoc.id;
        
        const agentWalletBalance = Number(uData.wallet || 0);
        const requestedAmt = Number(requiredAmount);

        // HIDE AGENTS WHO CAN'T AFFORD TO PAY THE USER
        if (agentWalletBalance < requestedAmt || uId === userData.uid) return null;

        const agentProfileDoc = await getDoc(doc(db, "agents", uId));
        if (agentProfileDoc.exists()) {
          const pData = agentProfileDoc.data();
          if (pData.application_status !== "approved") return null;

          return {
            id: uId,
            full_name: pData.full_name || uData.fullName || "Active Agent",
            exchange_rate: Number(pData.exchange_rate || 0),
            agentWallet: agentWalletBalance 
          };
        }
        return null;
      });

      const results = await Promise.all(agentPromises);
      const filteredResults = results.filter(a => a !== null);
      setAgents(filteredResults);

      if (selectedAgent && !filteredResults.find(a => a.id === selectedAgent.id)) {
        setSelectedAgent(null);
      }

    } catch (e) {
      console.error("Agent Fetch Error:", e);
    } finally {
      setAgentsLoading(false);
    }
  };

  const calculateWithdrawalFee = (amt) => {
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

  const handleWithdraw = async () => {
    const withdrawAmount = parseFloat(amount);
    const fee = method === "usdt" ? calculateWithdrawalFee(withdrawAmount) : 0;
    const totalDeduct = withdrawAmount + fee;

    if (!withdrawAmount || withdrawAmount <= 0) return alert("Enter a valid amount");
    if (totalDeduct > userData.main) return alert(`Insufficient balance.`);
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
          totalDeducted: totalDeduct,
          type: "withdrawal",
          status: "pending",
          method: "usdt",
          details: { usdtAddress },
          timestamp: serverTimestamp(),
        };
        await updateDoc(doc(db, "users", user.uid), { wallet: increment(-totalDeduct) });
        await addDoc(collection(db, "withdrawals"), txData);
        await addDoc(collection(db, "users", user.uid, "transactions"), txData);
        router.push("/dashboard");
      } else {
        const userTradeQ = query(collection(db, "trades"), where("senderId", "==", auth.currentUser.uid), limit(10));
        const userSnap = await getDocs(userTradeQ);
        if (userSnap.docs.some(d => d.data().status === "pending")) {
          alert("You have a pending trade.");
          setLoading(false);
          return;
        }

        const agentTradeQ = query(collection(db, "trades"), where("agentId", "==", selectedAgent.id), limit(10));
        const agentSnap = await getDocs(agentTradeQ);
        if (agentSnap.docs.some(d => d.data().status === "pending")) {
          alert("Agent is busy.");
          setLoading(false);
          return;
        }

        const tradeRef = await addDoc(collection(db, "trades"), {
          senderId: auth.currentUser.uid,
          agentId: selectedAgent.id,
          amount: withdrawAmount,
          rate: Number(selectedAgent.exchange_rate),
          type: "withdrawal",
          status: "pending",
          createdAt: serverTimestamp()
        });
        
        router.push(`/trade/${tradeRef.id}`);
      }
    } catch (err) {
      console.error(err);
      alert("Transaction failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white pb-10">
      <div className="p-6 pt-12 flex items-center justify-between bg-[#613de6] rounded-b-[2.5rem] shadow-xl">
        <button onClick={() => router.back()} className="p-2 bg-white/10 rounded-xl"><ChevronLeft size={20} /></button>
        <h1 className="font-black italic uppercase tracking-wider text-xs">Withdraw Funds</h1>
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
          <button onClick={() => setMethod("bank")} className={`p-5 rounded-3xl border-2 transition-all ${method === "bank" ? "border-[#613de6] bg-[#613de6]/10 shadow-lg shadow-[#613de6]/10" : "border-white/5 bg-[#1e293b] opacity-60"}`}>
            <Landmark size={24} className="mx-auto mb-2" />
            <span className="text-[10px] font-black uppercase block text-center">Local Agent</span>
          </button>
          <button onClick={() => setMethod("usdt")} className={`p-5 rounded-3xl border-2 transition-all ${method === "usdt" ? "border-[#613de6] bg-[#613de6]/10 shadow-lg shadow-[#613de6]/10" : "border-white/5 bg-[#1e293b] opacity-60"}`}>
            <Coins size={24} className="mx-auto mb-2" />
            <span className="text-[10px] font-black uppercase block text-center">USDT</span>
          </button>
        </div>

        <div className="bg-[#1e293b] p-6 rounded-[2rem] border border-white/5">
          <label className="text-[10px] font-black uppercase opacity-40 block mb-2">Withdrawal Amount ($)</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
            className="w-full bg-transparent font-black text-4xl text-white outline-none" />
        </div>

        {method === "bank" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center px-1">
              <h4 className="text-[10px] font-black uppercase text-gray-500">Qualified Agents</h4>
              <p className="text-[10px] font-bold text-[#fc7952] flex items-center gap-1"><MapPin size={10} /> {userData.country}</p>
            </div>

            {agentsLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin text-[#613de6]" /></div>
            ) : agents.length > 0 ? (
              <div className="space-y-3">
                {agents.map((agent) => (
                  <div key={agent.id} onClick={() => setSelectedAgent(agent)}
                    className={`p-5 rounded-3xl border-2 transition-all cursor-pointer flex justify-between items-center ${selectedAgent?.id === agent.id ? "border-[#613de6] bg-[#613de6]/10 shadow-lg" : "border-white/5 bg-[#1e293b]"}`}>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-[#613de6] rounded-2xl flex items-center justify-center font-black italic text-white shadow-lg">{agent.full_name.charAt(0)}</div>
                      <div>
                        <p className="font-black uppercase text-sm italic">{agent.full_name}</p>
                        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-tighter">Rate: {agent.exchange_rate} / $</p>
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
                <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest leading-relaxed">No agents with sufficient balance found in {userData.country}</p>
              </div>
            )}
          </div>
        )}

        {method === "usdt" && (
            <input type="text" placeholder="TRC20 Address" value={usdtAddress} onChange={(e) => setUsdtAddress(e.target.value)}
                className="w-full bg-[#1e293b] border border-white/5 p-5 rounded-2xl text-sm font-bold focus:border-[#613de6] outline-none transition-all" />
        )}

        <button onClick={handleWithdraw} disabled={loading || !amount || (method === 'bank' && !selectedAgent)}
          className="w-full bg-[#fc7952] py-6 rounded-[2rem] font-black italic uppercase flex items-center justify-center gap-2 shadow-2xl shadow-[#fc7952]/20 disabled:opacity-30 active:scale-95 transition-all">
          {loading ? <Loader2 className="animate-spin" /> : <>PROCEED <ArrowRight size={20} /></>}
        </button>
      </div>
    </div>
  );
}