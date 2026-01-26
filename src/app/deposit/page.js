"use client";
import { useState, useEffect } from "react";
import { Wallet, ArrowUpCircle, Gift, Gamepad2, ChevronRight, CreditCard, Landmark } from "lucide-react";
// FIREBASE IMPORTS
import { auth, db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

export default function DepositPage() {
  const [activeTab, setActiveTab] = useState("main");
  const [depositAmount, setDepositAmount] = useState("");
  const [userData, setUserData] = useState({
    main: 0,
    referral: 0,
    game: 0
  });

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userRef = doc(db, "users", user.uid);
        const unsubscribeSnap = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserData({
              main: data.wallet || 0,
              referral: data.referralBonus || 0,
              game: data.gameCredits || 0
            });
          }
        });
        return () => unsubscribeSnap();
      }
    });
    return () => unsubscribeAuth();
  }, []);

  const balanceData = {
    main: { amount: userData.main.toFixed(2), icon: <Wallet />, desc: "Used for withdrawals and stakes" },
    referral: { amount: userData.referral.toFixed(2), icon: <Gift />, desc: "Earned from inviting friends" },
    game: { amount: userData.game.toFixed(2), icon: <Gamepad2 />, desc: "Specific credits for round fees" }
  };

  const totalBalance = (userData.main + userData.referral + userData.game).toFixed(2);
  const quickAmounts = [10, 20, 50, 100, 500];

  return (
    <div className="min-h-screen bg-[#0f172a] pb-24 text-white">
      {/* Top Balance Summary */}
      <div className="bg-[#613de6] p-6 rounded-b-[3rem] shadow-xl">
        <p className="text-center text-white/70 text-xs font-bold uppercase tracking-widest mb-2">Total Combined Balance</p>
        <h1 className="text-4xl font-black text-center italic mb-6">
          <span className="text-[#fc7952]">$</span>{totalBalance}
        </h1>
        
        {/* Tab Switcher */}
        <div className="flex bg-black/20 p-1 rounded-2xl">
          {Object.keys(balanceData).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${
                activeTab === tab ? 'bg-white text-[#613de6] shadow-lg' : 'text-white/50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 max-w-md mx-auto space-y-8">
        {/* Active Balance Detail */}
        <div className="bg-[#1e293b] border border-gray-800 p-5 rounded-3xl flex items-center justify-between shadow-2xl">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-[#613de6]/10 rounded-2xl text-[#613de6]">
              {balanceData[activeTab].icon}
            </div>
            <div>
              <p className="text-xs text-gray-500 font-bold uppercase">{activeTab} Balance</p>
              <p className="text-xl font-black text-white italic">${balanceData[activeTab].amount}</p>
            </div>
          </div>
          <ArrowUpCircle className="text-[#fc7952] opacity-50" />
        </div>

        {/* Deposit Section */}
        <div>
          <h3 className="text-sm font-black uppercase italic mb-4 flex items-center">
            <CreditCard size={18} className="mr-2 text-[#fc7952]" /> Quick Deposit
          </h3>
          
          <div className="grid grid-cols-3 gap-3 mb-4">
            {quickAmounts.map((amt) => (
              <button
                key={amt}
                onClick={() => setDepositAmount(amt.toString())}
                className="bg-[#1e293b] border border-gray-800 py-3 rounded-xl font-bold hover:border-[#613de6] hover:text-[#613de6] transition-all active:scale-95"
              >
                ${amt}
              </button>
            ))}
          </div>

          <div className="relative mb-6">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-500">$</span>
            <input 
              type="number"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="Enter custom amount"
              className="w-full bg-[#1e293b] border border-gray-800 p-4 pl-10 rounded-2xl focus:ring-2 focus:ring-[#613de6] outline-none font-black text-white"
            />
          </div>

          {/* Payment Methods */}
          <div className="space-y-3">
            <PaymentMethod icon={<Landmark size={20}/>} name="Bank Transfer" />
            <PaymentMethod icon={<CreditCard size={20}/>} name="Debit/Credit Card" />
          </div>

          <button 
            disabled={!depositAmount || parseFloat(depositAmount) <= 0}
            className="w-full mt-8 py-4 rounded-2xl font-black text-white shadow-xl transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-30 disabled:grayscale"
            style={{ backgroundColor: '#613de6' }}
          >
            CONFIRM DEPOSIT
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentMethod({ icon, name }) {
  return (
    <div className="flex items-center justify-between bg-[#1e293b]/50 border border-gray-800 p-4 rounded-2xl cursor-pointer hover:bg-[#1e293b] hover:border-[#613de6]/50 transition-all group">
      <div className="flex items-center space-x-3">
        <div className="text-gray-500 group-hover:text-[#613de6] transition-colors">{icon}</div>
        <span className="text-sm font-bold text-gray-300 group-hover:text-white transition-colors">{name}</span>
      </div>
      <ChevronRight size={16} className="text-gray-600 group-hover:text-[#fc7952] transition-colors" />
    </div>
  );
}