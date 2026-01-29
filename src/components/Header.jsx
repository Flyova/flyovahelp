"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronDown, Wallet, LogOut, ArrowUpRight, LayoutDashboard } from "lucide-react";
// FIREBASE IMPORTS
import { auth, db } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";

export default function Header() {
  const router = useRouter();
  const [showBalances, setShowBalances] = useState(false);
  const [userData, setUserData] = useState({
    wallet: "0.00",
    referralBonus: "0.00",
    gameCredits: "0.00",
    isAgent: false // ADDED: to track agent status
  });

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const unsubscribeDoc = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserData({
              wallet: data.wallet?.toFixed(2) || "0.00",
              referralBonus: data.referralBonus?.toFixed(2) || "0.00",
              gameCredits: data.gameCredits?.toFixed(2) || "0.00",
              isAgent: data.isAgent || false // ADDED: mapping from Firestore
            });
          }
        });
        return () => unsubscribeDoc();
      } else {
        setUserData({ wallet: "0.00", referralBonus: "0.00", gameCredits: "0.00", isAgent: false });
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const handleDepositClick = () => {
    setShowBalances(false);
    router.push("/deposit");
  };

  const handleWithdrawClick = () => {
    setShowBalances(false);
    router.push("/withdrawal");
  };

  const handleAgentDashboardClick = () => {
    setShowBalances(false);
    router.push("/agent/dashboard");
  };

  const handleLogout = async () => {
    try {
      const user = auth.currentUser;
      if (user) {
        // Mark user as offline in Firestore before logging out
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, { status: "offline" });
      }
      
      await signOut(auth);
      setShowBalances(false);
      router.push("/login");
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  return (
    <header className="sticky top-0 z-[100] w-full bg-[#613de6] text-white shadow-lg">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo - Clickable to Dashboard */}
        <div 
          className="flex items-center space-x-2 cursor-pointer"
          onClick={() => router.push('/dashboard')}
        >
          <Image src="/logo.svg" alt="Logo" width={100} height={22} />
        </div>

        {/* Real-Time Balance Selector */}
        <div className="relative">
          <button 
            onClick={() => setShowBalances(!showBalances)}
            className="bg-black/20 hover:bg-black/30 transition px-3 py-1.5 rounded-full flex items-center space-x-2 border border-white/10 active:scale-95"
          >
            <Wallet size={14} className="text-[#fc7952]" />
            <span className="font-mono font-black text-sm tracking-tight">${userData.wallet}</span>
            <ChevronDown size={14} className={`transition-transform duration-300 ${showBalances ? 'rotate-180' : ''}`} />
          </button>

          {showBalances && (
            <div className="absolute right-0 mt-3 w-64 bg-[#1e293b] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/5 overflow-hidden animate-in fade-in zoom-in-95">
              <div className="p-4 space-y-4">
                <div className="bg-black/20 p-3 rounded-xl">
                    <BalanceItem label="Main Balance" amount={userData.wallet} color="text-white text-lg" />
                </div>
                
                <div className="px-1 space-y-3">
                    <BalanceItem label="Referral Bonus" amount={userData.referralBonus} color="text-green-400" />
                    <BalanceItem label="Active Stakes" amount={userData.gameCredits} color="text-[#fc7952]" />
                </div>

                <div className="space-y-2">
                  {/* ADDED: Agent Dashboard Button (only shows if user is agent) */}
                  {userData.isAgent && (
                    <button 
                      onClick={handleAgentDashboardClick}
                      className="w-full bg-[#613de6] hover:bg-[#7251ed] py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-[#613de6]/20 active:scale-95 flex items-center justify-center space-x-2 border border-white/10"
                    >
                      <LayoutDashboard size={14} />
                      <span>Agent Dashboard</span>
                    </button>
                  )}

                  {/* Withdrawal Button */}
                  <button 
                    onClick={handleWithdrawClick}
                    className="w-full bg-green-500 hover:bg-green-600 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-green-500/20 active:scale-95 flex items-center justify-center space-x-2"
                  >
                    <ArrowUpRight size={14} />
                    <span>Withdraw Funds</span>
                  </button>

                  {/* Deposit Button */}
                  <button 
                    onClick={handleDepositClick}
                    className="w-full bg-[#fc7952] hover:bg-[#ff8a6a] py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-[#fc7952]/20 active:scale-95"
                  >
                    DEPOSIT FUNDS
                  </button>

                  {/* Logout Button */}
                  <button 
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center space-x-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-red-500/20 active:scale-95 group"
                  >
                    <LogOut size={14} className="group-hover:translate-x-1 transition-transform" />
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function BalanceItem({ label, amount, color }) {
  return (
    <div className="flex justify-between items-center last:border-0">
      <span className="text-[9px] uppercase font-black text-gray-500 tracking-wider">{label}</span>
      <span className={`font-mono font-bold ${color}`}>${amount}</span>
    </div>
  );
}