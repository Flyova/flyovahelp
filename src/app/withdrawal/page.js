"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { authFetch } from "@/lib/authFetch";
import { freeWithdrawalPerk, freeWithdrawalPerksFor, perkDays, usedFreeWithdrawals } from "@/lib/accountPerks";
import { formatLocal } from "@/lib/currency";
import PinPrompt from "@/components/PinPrompt";
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
  const [resultingBalance, setResultingBalance] = useState(null);
  const [askPin, setAskPin] = useState(false);
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
              bonusDeducted: data.bonusDeducted || false,
              restrictWithdrawal: data.restrictWithdrawal || false,
              createdMs: data.createdAt?.toMillis?.() || Date.parse(u.metadata?.creationTime || "") || 0,
              usedFree: usedFreeWithdrawals(data),
              isAgent: data.isAgent === true,
              hasBank: !!data.bank?.accountNumber,
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
        fetchAgents(parseFloat(amount) || 0);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [method, userData.country, amount]);

  const fetchAgents = async (amt) => {
    setAgentsLoading(true);
    try {
      // Agents' records aren't readable by players: the server lists the ones in your country,
      // each with their sell rate for this amount (agents can set others for bigger amounts).
      const res = await authFetch(`/api/trades?view=agents&type=withdrawal&amount=${encodeURIComponent(amt || 0)}`);
      if (res.error) throw new Error(res.error);
      const validAgents = res.agents.map((a) => ({ id: a.id, full_name: a.full_name, exchange_rate: a.rate ?? a.withdrawal_rate, country: a.country || userData.country }));

      setAgents(validAgents);

      const still = selectedAgent && validAgents.find(a => a.id === selectedAgent.id);
      setSelectedAgent(still || null);

    } catch (e) {
      console.error("Agent Fetch Error:", e);
    } finally {
      setAgentsLoading(false);
    }
  };

  // Free USDT withdrawals on certain days, by account age, agent status and country
  // (lib/accountPerks; the server decides).
  const perkArgs = { createdMs: userData.createdMs, isAgent: userData.isAgent, country: userData.country, used: userData.usedFree || {} };
  const freePerk = (amt) => (method === "usdt" ? freeWithdrawalPerk({ ...perkArgs, amount: parseFloat(amt) || 0 }) : null);
  const isFree = (amt) => !!freePerk(amt);
  const myPerks = freeWithdrawalPerksFor(perkArgs);

  const calculateWithdrawalFee = (amt) => {
    if (method !== "usdt" || isFree(amt)) return 0.00;
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

  const isValidAccountName = (name) => {
    if (!name) return false;
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return false;
    // Reject initials like "P." or "P" — each part needs to be a real name, not an abbreviation
    return parts.every((p) => p.replace(/\./g, "").length > 1);
  };

  const isEligibleForBonusDeduction = userData.bonusClaimed && !userData.bonusDeducted;
  const bonusDeduction = isEligibleForBonusDeduction ? 3.00 : 0.00;
  
  const minWithdrawal = method === "usdt" ? 10 : 1; // a local agent pays out from $1
  const currentFee = calculateWithdrawalFee(amount);
  const totalDeductible = (parseFloat(amount) || 0) + currentFee + bonusDeduction;

const handleWithdraw = async () => {
    const withdrawAmount = parseFloat(amount);
    const fee = calculateWithdrawalFee(withdrawAmount);
    const totalDeduct = withdrawAmount + fee + bonusDeduction;

    if (!isValidAccountName(userData.fullName)) {
      return alert("Your account name is incomplete or invalid for withdrawals. Please ensure your registered name includes a full first and last name (e.g. John Doe) — single names or initials (e.g. John, Peter P.) are not accepted. Contact support to update your account name.");
    }
    if (!withdrawAmount || withdrawAmount <= 0) return alert("Enter a valid amount");
    if (totalDeduct > userData.main) return alert(`Insufficient balance. You need $${totalDeduct.toFixed(2)} total (including fees/bonus recovery).`);
    if (withdrawAmount < minWithdrawal) return alert(`Minimum withdrawal is $${minWithdrawal}.00`);
    if (method === "usdt" && !usdtAddress) return alert("Please enter USDT address");
    if (method === "bank" && !selectedAgent) return alert("Please select an agent");
    if (method === "bank" && !userData.hasBank) {
      if (confirm("Add your bank account in Settings before withdrawing with an agent. It must be in your account's name. Go to Settings now?")) router.push("/settings");
      return;
    }
    setAskPin(true);
  };

  // With the 4-digit PIN: the server checks it and the balance, fee and bonus recovery
  // again, moves the money and sends the emails. Errors stay in the PIN prompt.
  const withdrawWithPin = async (txPin) => {
    const withdrawAmount = parseFloat(amount);
    setLoading(true);
    try {
      const res = method === "usdt"
        ? await authFetch("/api/wallet", { method: "POST", body: { action: "withdraw", amount: withdrawAmount, address: usdtAddress, txPin } })
        : await authFetch("/api/trades", { method: "POST", body: { action: "create", type: "withdrawal", agentId: selectedAgent.id, amount: withdrawAmount, txPin } });
      if (res.error) return res;
      setAskPin(false);
      setResultingBalance(res.balance ?? Number(userData.main || 0) - totalDeductible);
      setShowSuccess(true);
      setTimeout(() => router.push(method === "usdt" ? "/dashboard" : `/trade/${res.id}`), 3000);
    } catch (err) {
      console.error(err);
      return { error: "Transaction failed." };
    } finally {
      setLoading(false);
    }
  };

  if (systemLoading) {
    return (
      <div className="min-h-screen bg-[#0B1220] flex flex-col items-center justify-center">
        <Loader2 className="animate-spin text-[#2457D6]" size={40} />
      </div>
    );
  }

  if (systemSettings && systemSettings.withdrawalEnabled === false) {
    return (
        <div className="min-h-screen bg-[#0B1220] p-6 flex flex-col items-center justify-center text-center">
            <div className="bg-rose-500/10 p-8 rounded-full mb-8 border border-rose-500/20">
                <ShieldAlert size={60} className="text-rose-500" />
            </div>
            <h2 className="text-3xl font-black italic uppercase text-white mb-3">Payouts Offline</h2>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-[0.2em] max-w-[280px] leading-relaxed">
                The withdrawal system is temporarily disabled. Please contact support or check back later.
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

  if (userData.restrictWithdrawal) {
    return (
        <div className="min-h-screen bg-[#0B1220] p-6 flex flex-col items-center justify-center text-center">
            <div className="bg-rose-500/10 p-8 rounded-full mb-8 border border-rose-500/20">
                <ShieldAlert size={60} className="text-rose-500" />
            </div>
            <h2 className="text-3xl font-black italic uppercase text-white mb-3">Withdrawals Restricted</h2>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-[0.2em] max-w-[280px] leading-relaxed">
                Withdrawals have been restricted on your account. Please contact support for assistance.
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

  return (
    <div className="min-h-screen bg-[#0B1220] text-white pb-10 relative">
      
      {/* SUCCESS OVERLAY */}
      {showSuccess && (
        <div className="fixed inset-0 z-[100] bg-[#0B1220]/95 flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-[#142036] border border-white/10 p-10 rounded-[3rem] text-center space-y-6 shadow-2xl scale-up-center">
            <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-[0_0_40px_rgba(16,185,129,0.3)]">
              <CheckCircle2 size={40} className="text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black italic uppercase">Withdrawal Submitted!</h2>
              <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mt-1">Redirecting to Dashboard...</p>
            </div>
            {resultingBalance !== null && (
              <div className="bg-[#0B1220] border border-white/5 rounded-3xl py-4 px-6">
                <p className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-1">Remaining Balance</p>
                <p className="text-2xl font-black italic text-[#8B1E3F]">${resultingBalance.toFixed(2)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="p-6 pt-12 flex items-center justify-between bg-[#2457D6] rounded-b-[2.5rem] shadow-xl">
        <button onClick={() => router.back()} className="p-2 bg-white/10 rounded-xl"><ChevronLeft size={20} /></button>
        <h1 className="font-black italic uppercase tracking-wider text-xs text-white">Withdraw Funds</h1>
        <div className="w-10" />
      </div>

      <div className="p-6 max-w-md mx-auto space-y-6">
        <div className="bg-[#142036] p-6 rounded-[2.5rem] border border-white/5 flex justify-between items-center shadow-2xl">
          <div>
            <p className="text-[10px] font-black opacity-40 uppercase mb-1">Available Balance</p>
            <p className="text-3xl font-black italic text-[#8B1E3F]">${userData.main.toLocaleString()}</p>
          </div>
          <Wallet size={24} className="text-[#2457D6]" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button onClick={() => setMethod("bank")} className={`p-5 rounded-3xl border-2 transition-all ${method === "bank" ? "border-[#2457D6] bg-[#2457D6]/10 shadow-lg" : "border-white/5 bg-[#142036] opacity-60"}`}>
            <div className="relative">
              <Landmark size={24} className="mx-auto mb-2 text-[#2457D6]" />
            </div>
            <span className="text-[10px] font-black uppercase block text-center">Local Agent</span>
          </button>
          <button onClick={() => setMethod("usdt")} className={`p-5 rounded-3xl border-2 transition-all ${method === "usdt" ? "border-[#2457D6] bg-[#2457D6]/10 shadow-lg" : "border-white/5 bg-[#142036] opacity-60"}`}>
            <Coins size={24} className="mx-auto mb-2 text-[#7A9BEE]" />
            <span className="text-[10px] font-black uppercase block text-center">USDT (TRC20)</span>
          </button>
        </div>

        <div className="bg-[#142036] p-6 rounded-[2rem] border border-white/5">
          <label className="text-[10px] font-black uppercase opacity-40 block mb-2">Withdrawal Amount ($)</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
            className="w-full bg-transparent font-black text-4xl text-white outline-none" />
        </div>

        {method === "usdt" && myPerks.length > 0 && (
          <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-3xl space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Your free withdrawals</p>
            {myPerks.map((p) => (
              <p key={p.id} className={`text-[11px] font-bold ${p.usedThisMonth ? "text-white/30 line-through" : "text-white/70"}`}>
                {p.min === p.max ? `$${p.min}` : `$${p.min}–$${p.max}`} on {perkDays(p)} of each month, no fee{p.usedThisMonth ? " (used this month)" : ""}
              </p>
            ))}
          </div>
        )}

        {method === "bank" && selectedAgent && parseFloat(amount) >= minWithdrawal && (
          <div className="bg-[#2457D6]/5 border border-[#2457D6]/20 p-5 rounded-3xl space-y-2">
            <p className="text-[9px] font-black uppercase text-white/40 tracking-widest">You receive from {selectedAgent.full_name}</p>
            <p className="text-[11px] font-bold text-white/60">
              ${Number(amount || 0).toFixed(2)} × {Number(selectedAgent.exchange_rate).toLocaleString()} (their rate)
            </p>
            <p className="text-lg font-black text-white">
              = {formatLocal(Number(amount || 0) * Number(selectedAgent.exchange_rate || 0), selectedAgent.country)}
            </p>
          </div>
        )}

        {parseFloat(amount) >= minWithdrawal && (method === "usdt" || isEligibleForBonusDeduction) && (
          <div className="bg-[#2457D6]/5 border border-[#2457D6]/20 p-5 rounded-3xl space-y-3 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2 mb-1">
               <Receipt size={14} className="text-[#2457D6]" />
               <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Transaction Summary</span>
            </div>

            {method === "usdt" && (
              <div className="flex justify-between items-center">
                 <span className="text-[11px] font-bold text-gray-500">Service Fee</span>
                 {isFree(amount)
                   ? <span className="text-[11px] font-black text-emerald-400">Free · {freePerk(amount).label}</span>
                   : <span className="text-[11px] font-black text-rose-500">+ ${currentFee.toFixed(2)}</span>}
              </div>
            )}

            {isEligibleForBonusDeduction && (
              <div className="flex justify-between items-center text-amber-500">
                <span className="text-[11px] font-bold flex items-center gap-1 uppercase tracking-tight">
                    <Gift size={12} /> Bonus Deductible
                </span>
                <span className="text-[11px] font-black">+ $3.00</span>
              </div>
            )}

            <div className="h-px bg-white/5 w-full" />
            <div className="flex justify-between items-center">
               <span className="text-[11px] font-bold text-white">Total Deductible</span>
               <span className="text-lg font-black italic text-[#8B1E3F]">${totalDeductible.toFixed(2)}</span>
            </div>
            
            {isEligibleForBonusDeduction && (
                <p className="text-[9px] font-bold text-amber-500/60 leading-tight uppercase tracking-tighter pt-1">
                    * The $3.00 signup bonus is deducted from your first {method === "usdt" ? "USDT" : "Agent"} withdrawal.
                </p>
            )}
          </div>
        )}

        {method === "bank" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center px-1">
              <h4 className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Qualified Merchants</h4>
              <p className="text-[10px] font-bold text-[#8B1E3F] flex items-center gap-1 uppercase"><MapPin size={10} /> {userData.country}</p>
            </div>

            {agentsLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin text-[#2457D6]" /></div>
            ) : agents.length > 0 ? (
              <div className="space-y-3">
                {agents.map((agent) => (
                  <div key={agent.id} onClick={() => setSelectedAgent(agent)}
                    className={`p-5 rounded-3xl border-2 transition-all cursor-pointer flex justify-between items-center ${selectedAgent?.id === agent.id ? "border-[#2457D6] bg-[#2457D6]/10 shadow-lg" : "border-white/5 bg-[#142036]"}`}>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-[#2457D6] rounded-2xl flex items-center justify-center font-black italic text-white shadow-lg uppercase">{agent.full_name.charAt(0)}</div>
                      <div>
                        <p className="font-black uppercase text-sm italic tracking-tight">{agent.full_name}</p>
                        <p className="text-[9px] font-bold text-[#7A9BEE] uppercase tracking-tighter">Sell Rate: {agent.exchange_rate} / $</p>
                      </div>
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedAgent?.id === agent.id ? 'border-[#2457D6] bg-[#2457D6]' : 'border-white/10'}`}>
                      {selectedAgent?.id === agent.id && <Check size={12} className="text-white" />}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-[#142036] p-10 rounded-3xl border border-dashed border-white/10 text-center">
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
                    className="w-full bg-[#142036] border border-white/5 p-5 rounded-2xl text-sm font-bold focus:border-[#2457D6] outline-none transition-all placeholder:opacity-20" />
                <p className="text-[9px] font-bold text-rose-500 uppercase flex items-center gap-1"><AlertCircle size={10} /> Double check your address</p>
            </div>
        )}

        <button onClick={handleWithdraw} disabled={loading || !amount || (method === 'bank' && !selectedAgent)}
          className="w-full bg-[#8B1E3F] py-6 rounded-[2rem] font-black italic uppercase flex items-center justify-center gap-2 shadow-2xl shadow-[#8B1E3F]/20 disabled:opacity-30 active:scale-95 transition-all text-white">
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
      <PinPrompt
        open={askPin}
        title="Confirm Withdrawal"
        subtitle={`Withdraw $${(parseFloat(amount) || 0).toFixed(2)}${method === "bank" && selectedAgent ? ` with ${selectedAgent.full_name}` : " to your USDT address"}. Enter your 4-digit PIN.`}
        onClose={() => setAskPin(false)}
        onSubmit={withdrawWithPin}
      />
    </div>
  );
}
