"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { 
  ChevronDown, 
  Wallet, 
  LogOut, 
  ArrowUpRight, 
  LayoutDashboard,
  Send,
  Copy,
  Check,
  Users,
  MessageCircle // Added for Support
} from "lucide-react";
// FIREBASE IMPORTS
import { auth, db } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";

export default function Header() {
  const router = useRouter();
  const [showBalances, setShowBalances] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasUnreadSupport, setHasUnreadSupport] = useState(false); // Support state
  const [userData, setUserData] = useState({
    wallet: "0.00",
    referralBonus: "0.00",
    gameCredits: "0.00",
    agentBalance: "0.00",
    pin: "--------",
    isAgent: false 
  });

  useEffect(() => {
    let unsubscribeUser = null;
    let unsubscribeAgent = null;
    let unsubscribeSupport = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        
        // 1. Listen to User Document
        unsubscribeUser = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserData(prev => ({
              ...prev,
              wallet: data.wallet?.toFixed(2) || "0.00",
              referralBonus: data.referralBonus?.toFixed(2) || "0.00",
              gameCredits: data.gameCredits?.toFixed(2) || "0.00",
              pin: data.pin || "--------",
              isAgent: data.isAgent || false
            }));

            // Handle Agent Specific Balance
            if (data.isAgent) {
              const agentDocRef = doc(db, "agents", user.uid);
              unsubscribeAgent = onSnapshot(agentDocRef, (agentSnap) => {
                if (agentSnap.exists()) {
                  const agentData = agentSnap.data();
                  setUserData(prev => ({
                    ...prev,
                    agentBalance: agentData.agent_balance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"
                  }));
                }
              });
            }
          }
        });

        // 2. Listen for Support Messages (Simulated Push)
        const chatRef = doc(db, "support_chats", user.uid);
        unsubscribeSupport = onSnapshot(chatRef, (snap) => {
          if (snap.exists()) {
            const chatData = snap.data();
            setHasUnreadSupport(chatData.unreadByUser === true);
          }
        });

      } else {
        if (unsubscribeUser) unsubscribeUser();
        if (unsubscribeAgent) unsubscribeAgent();
        if (unsubscribeSupport) unsubscribeSupport();
        setUserData({ wallet: "0.00", referralBonus: "0.00", gameCredits: "0.00", agentBalance: "0.00", pin: "--------", isAgent: false });
        setHasUnreadSupport(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUser) unsubscribeUser();
      if (unsubscribeAgent) unsubscribeAgent();
      if (unsubscribeSupport) unsubscribeSupport();
    };
  }, []);

  const handleCopyPin = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(userData.pin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDepositClick = () => { setShowBalances(false); router.push("/deposit"); };
  const handleWithdrawClick = () => { setShowBalances(false); router.push("/withdrawal"); };
  const handleTransferClick = () => { setShowBalances(false); router.push("/transfer"); };
  const handleAgentDashboardClick = () => { setShowBalances(false); router.push("/agent/dashboard"); };
  const handleReferralsClick = () => { setShowBalances(false); router.push("/referrals"); };
  const handleSupportClick = () => { setShowBalances(false); router.push("/support"); };

  const handleLogout = async () => {
    try {
      const user = auth.currentUser;
      if (user) {
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
        <div 
          className="flex items-center space-x-2 cursor-pointer"
          onClick={() => router.push('/dashboard')}
        >
          <Image src="/logo.svg" alt="Logo" width={100} height={22} />
        </div>

        <div className="flex items-center space-x-3">
          {/* SUPPORT ICON WITH ALERT BADGE */}
          {/* LIVE CHAT BUTTON */}
          <div 
            onClick={handleSupportClick}
            className="relative flex items-center gap-2 px-3 py-2 bg-black/10 hover:bg-black/20 rounded-full cursor-pointer transition-all active:scale-95 border border-white/5"
          >
            <div className="relative">
              <MessageCircle size={16} className="text-white" />
              {hasUnreadSupport && (
                <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border border-[#613de6]"></span>
                </span>
              )}
            </div>
            <span className="text-[9px] font-black uppercase tracking-[0.1em] text-white/90">
              Live Chat
            </span>
          </div>

          {/* WALLET SECTION */}
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
                  
                  <div className="bg-[#0f172a] p-3 rounded-xl border border-white/5 flex justify-between items-center">
                      <div>
                          <p className="text-[8px] font-black uppercase text-gray-500 tracking-widest leading-none mb-1">Identity PIN</p>
                          <p className="text-sm font-mono font-black text-[#fc7952] tracking-wider">{userData.pin}</p>
                      </div>
                      <button 
                          onClick={handleCopyPin}
                          className="p-2 hover:bg-white/5 rounded-lg transition-colors active:scale-90"
                      >
                          {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} className="text-gray-500" />}
                      </button>
                  </div>

                  <div className="bg-black/20 p-3 rounded-xl">
                      <BalanceItem label="Main Balance" amount={userData.wallet} color="text-white text-lg" />
                  </div>
                  
                  <div className="px-1 space-y-3">
                      <BalanceItem label="Referral Bonus" amount={userData.referralBonus} color="text-green-400" />
                      
                      {userData.isAgent ? (
                        <BalanceItem label="Agent Balance" amount={userData.agentBalance} color="text-[#fc7952]" />
                      ) : (
                        Number(userData.gameCredits) > 0 && (
                          <BalanceItem label="Active Stakes" amount={userData.gameCredits} color="text-[#fc7952]" />
                        )
                      )}
                  </div>

                  <div className="space-y-2">
                    {userData.isAgent && (
                      <button 
                        onClick={handleAgentDashboardClick}
                        className="w-full bg-[#613de6] hover:bg-[#7251ed] py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-[#613de6]/20 active:scale-95 flex items-center justify-center space-x-2 border border-white/10"
                      >
                        <LayoutDashboard size={14} />
                        <span>Agent Dashboard</span>
                      </button>
                    )}

                    <button 
                      onClick={handleTransferClick}
                      className="w-full bg-blue-500 hover:bg-blue-600 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20 active:scale-95 flex items-center justify-center space-x-2"
                    >
                      <Send size={14} />
                      <span>Transfer Funds</span>
                    </button>

                    <button 
                      onClick={handleWithdrawClick}
                      className="w-full bg-green-500 hover:bg-green-600 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-green-500/20 active:scale-95 flex items-center justify-center space-x-2"
                    >
                      <ArrowUpRight size={14} />
                      <span>Withdraw Funds</span>
                    </button>

                    <button 
                      onClick={handleDepositClick}
                      className="w-full bg-[#fc7952] hover:bg-[#ff8a6a] py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-[#fc7952]/20 active:scale-95"
                    >
                      DEPOSIT FUNDS
                    </button>

                    <button 
                      onClick={handleReferralsClick}
                      className="w-full bg-white/5 hover:bg-white/10 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center space-x-2 border border-white/5"
                    >
                      <Users size={14} className="text-green-400" />
                      <span>My Referrals</span>
                    </button>

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