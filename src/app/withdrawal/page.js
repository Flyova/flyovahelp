"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import { doc, onSnapshot, serverTimestamp, collection, addDoc, increment, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { ChevronLeft, Landmark, Coins, ArrowRight, ShieldCheck, Wallet } from "lucide-react";

export default function WithdrawalPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [myWallet, setMyWallet] = useState(0);
  const [method, setMethod] = useState("bank"); // 'bank' or 'usdt'
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  // Form Fields
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [usdtAddress, setUsdtAddress] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        onSnapshot(doc(db, "users", u.uid), (snap) => {
          if (snap.exists()) setMyWallet(snap.data().wallet || 0);
        });
      } else {
        router.push("/login");
      }
    });
    return () => unsub();
  }, [router]);

  const handleWithdraw = async () => {
    const withdrawAmount = parseFloat(amount);
    if (!withdrawAmount || withdrawAmount <= 0) return alert("Enter a valid amount");
    if (withdrawAmount > myWallet) return alert("Insufficient balance");
    if (withdrawAmount < 10) return alert("Minimum withdrawal is $10.00");

    setLoading(true);
    try {
      // 1. Deduct from wallet immediately
      await updateDoc(doc(db, "users", user.uid), {
        wallet: increment(-withdrawAmount)
      });

      // 2. Create a pending transaction log
      await addDoc(collection(db, "users", user.uid, "transactions"), {
        title: method === "bank" ? "Bank Withdrawal" : "USDT Withdrawal",
        amount: withdrawAmount,
        type: "withdrawal",
        status: "pending",
        method: method,
        details: method === "bank" ? { bankName, accountNumber } : { usdtAddress },
        timestamp: serverTimestamp()
      });

      alert("Withdrawal request sent! It will be processed shortly.");
      router.push("/dashboard");
    } catch (err) {
      console.error(err);
      alert("Error processing withdrawal.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col">
      {/* Header */}
      <div className="p-6 flex items-center justify-between bg-[#613de6]">
        <button onClick={() => router.back()} className="p-2 bg-white/10 rounded-xl">
          <ChevronLeft size={20} />
        </button>
        <h1 className="font-black italic uppercase tracking-wider">Withdraw Funds</h1>
        <div className="w-10" /> {/* Spacer */}
      </div>

      <div className="p-6 flex-1 max-w-md mx-auto w-full space-y-8">
        {/* Balance Card */}
        <div className="bg-[#1e293b] p-6 rounded-[2.5rem] border border-white/5 flex justify-between items-center shadow-2xl">
          <div>
            <p className="text-[10px] font-black opacity-40 uppercase mb-1">Available Balance</p>
            <p className="text-3xl font-black italic text-[#fc7952]">${myWallet.toFixed(2)}</p>
          </div>
          <Wallet size={32} className="opacity-20" />
        </div>

        {/* Method Toggle */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setMethod("bank")}
            className={`p-4 rounded-2xl border-2 flex flex-col items-center space-y-2 transition-all ${
              method === "bank" ? "border-[#613de6] bg-[#613de6]/10" : "border-white/5 bg-[#1e293b]"
            }`}
          >
            <Landmark size={24} className={method === "bank" ? "text-[#fc7952]" : "text-gray-500"} />
            <span className="text-[10px] font-black uppercase">Bank Transfer</span>
          </button>

          <button
            onClick={() => setMethod("usdt")}
            className={`p-4 rounded-2xl border-2 flex flex-col items-center space-y-2 transition-all ${
              method === "usdt" ? "border-[#613de6] bg-[#613de6]/10" : "border-white/5 bg-[#1e293b]"
            }`}
          >
            <Coins size={24} className={method === "usdt" ? "text-[#fc7952]" : "text-gray-500"} />
            <span className="text-[10px] font-black uppercase">USDT (TRC20)</span>
          </button>
        </div>

        {/* Input Fields */}
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase opacity-40 ml-4 mb-2 block">Amount to Withdraw</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-[#1e293b] border border-white/5 p-5 rounded-2xl font-black text-xl text-[#fc7952] focus:outline-none focus:border-[#613de6]"
            />
          </div>

          {method === "bank" ? (
            <div className="space-y-4 animate-in slide-in-from-bottom-2">
              <input
                type="text"
                placeholder="Bank Name"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full bg-[#1e293b] border border-white/5 p-4 rounded-2xl text-sm focus:outline-none"
              />
              <input
                type="text"
                placeholder="Account Number"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                className="w-full bg-[#1e293b] border border-white/5 p-4 rounded-2xl text-sm focus:outline-none"
              />
            </div>
          ) : (
            <div className="animate-in slide-in-from-bottom-2">
              <input
                type="text"
                placeholder="TRC20 Wallet Address"
                value={usdtAddress}
                onChange={(e) => setUsdtAddress(e.target.value)}
                className="w-full bg-[#1e293b] border border-white/5 p-4 rounded-2xl text-sm focus:outline-none"
              />
              <p className="text-[9px] text-red-400 font-bold uppercase mt-2 px-4 italic">
                * Ensure this is a TRC20 address or funds will be lost.
              </p>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="flex items-start space-x-3 bg-white/5 p-4 rounded-2xl border border-white/5">
          <ShieldCheck size={18} className="text-green-400 shrink-0" />
          <p className="text-[10px] text-gray-400 leading-relaxed uppercase font-bold">
            Withdrawals are processed within 24 hours. Minimum withdrawal is $10.00.
          </p>
        </div>

        {/* Action Button */}
        <button
          onClick={handleWithdraw}
          disabled={loading}
          className="w-full bg-[#fc7952] py-5 rounded-2xl font-black italic uppercase flex items-center justify-center space-x-2 shadow-xl shadow-[#fc7952]/20 active:scale-95 disabled:opacity-50 transition-all"
        >
          {loading ? <span>PROCESSING...</span> : (
            <>
              <span>Request Withdrawal</span>
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}