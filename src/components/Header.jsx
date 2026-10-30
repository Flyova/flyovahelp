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
  TrendingUp,
  Bell,
  Gift
} from "lucide-react";
// FIREBASE IMPORTS
import { auth, db } from "@/lib/firebase";
import { collection, doc, limit, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";

/** `hideOnMobile`: hidden below md but still mounted, so the idle sign-out below keeps running. */
export default function Header({ hideOnMobile = false }) {
  const router = useRouter();
  const [showBalances, setShowBalances] = useState(false);
  const [copied, setCopied] = useState(false);
  const [userData, setUserData] = useState({
    wallet: "0.00",
    referralBonus: "0.00",
    inflowBonus: "0.00",
    gameCredits: "0.00",
    agentBalance: "0.00",
    pin: "--------",
    isAgent: false,
    signupRewards: "0.0000",
  });
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let unsubscribeUser = null;
    let unsubscribeAgent = null;
    let unsubscribeUnread = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        // The bell: unread notifications (lib/notifications on the server).
        unsubscribeUnread = onSnapshot(
          query(collection(db, "users", user.uid, "notifications"), where("read", "==", false), limit(99)),
          (snap) => setUnread(snap.size),
          () => setUnread(0)
        );
        
        // 1. Listen to User Document
        unsubscribeUser = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();

            setUserData(prev => ({
              ...prev,
              wallet: data.wallet?.toFixed(2) || "0.00",
              referralBonus: data.referralBonus?.toFixed(2) || "0.00",
              inflowBonus: Number(data.inflowBonus || 0).toFixed(2),
              gameCredits: data.gameCredits?.toFixed(2) || "0.00",
              pin: data.pin || "--------",
              isAgent: data.isAgent || false,
              signupRewards: (Number(data.signupRewards || 0) * 0.0001).toFixed(4),
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

      } else {
        if (unsubscribeUser) unsubscribeUser();
        if (unsubscribeAgent) unsubscribeAgent();
        if (unsubscribeUnread) unsubscribeUnread();
        setUnread(0);
        setUserData({ wallet: "0.00", referralBonus: "0.00", inflowBonus: "0.00", gameCredits: "0.00", agentBalance: "0.00", pin: "--------", isAgent: false, signupRewards: "0.0000" });
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUser) unsubscribeUser();
      if (unsubscribeAgent) unsubscribeAgent();
      if (unsubscribeUnread) unsubscribeUnread();
    };
  }, []);

  useEffect(() => {
    let hiddenAt = null;

    const handleVisibility = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }

      if (document.visibilityState === "visible" && hiddenAt) {
        const hiddenMs = Date.now() - hiddenAt;
        hiddenAt = null;
        if (hiddenMs >= 15 * 60 * 1000) {
          try {
            await updateDoc(doc(db, "users", currentUser.uid), { status: "offline" });
          } catch (e) {
            console.error("Status update failed before forced relogin", e);
          }
          await signOut(auth);
          router.push("/login");
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [router]);

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
  const handleInflowClick = () => { setShowBalances(false); router.push("/inflow"); };

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
    <>
      {showBalances && (
        <button
          type="button"
          aria-label="Close wallet dropdown"
          onClick={() => setShowBalances(false)}
          className="fixed inset-0 z-[90] bg-[#0B1220]/35 backdrop-blur-sm"
        />
      )}

      <header className={`sticky top-0 z-[100] w-full bg-[#2457D6] text-[#F5F3EE] shadow-lg ${hideOnMobile ? "max-md:hidden" : ""}`} style={{ fontFamily: "Montserrat, sans-serif" }}>
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <div 
          className="flex items-center space-x-2 cursor-pointer"
          onClick={() => router.push('/')}
        >
          <Image src="/logo.png" alt="Logo" width={100} height={17} />
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => router.push("/notifications")}
            aria-label={unread ? `${unread} unread notifications` : "Notifications"}
            className="relative p-2 rounded-full bg-black/20 hover:bg-black/30 border border-white/10 active:scale-95"
          >
            <Bell size={16} />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#8B1E3F] text-[9px] font-black flex items-center justify-center">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
          {/* WALLET SECTION */}
          <div className="relative">
            <button 
              onClick={() => setShowBalances(!showBalances)}
              className="bg-black/20 hover:bg-black/30 transition px-3 py-1.5 rounded-full flex items-center space-x-2 border border-white/10 active:scale-95"
            >
              <Wallet size={14} className="text-[#F5F3EE]" />
              <span className="font-black text-sm tracking-tight">${userData.wallet}</span>
              <ChevronDown size={14} className={`transition-transform duration-300 ${showBalances ? 'rotate-180' : ''}`} />
            </button>

            {showBalances && (
              <div className="absolute right-0 mt-3 w-64 bg-[#142036] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/5 overflow-hidden animate-in fade-in zoom-in-95">
                <div className="p-4 space-y-4">
                  
                  <div className="bg-[#0B1220] p-3 rounded-xl border border-white/5 flex justify-between items-center">
                      <div>
                          <p className="text-[8px] font-black uppercase text-gray-500 tracking-widest leading-none mb-1">Identity PIN</p>
                          <p className="text-sm font-black text-[#F5F3EE] tracking-wider">{userData.pin}</p>
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
                      <BalanceItem label="Referral Bonus" amount={userData.referralBonus} color="text-green-400" onClick={() => { setShowBalances(false); router.push("/referrals"); }} />
                      <BalanceItem label="Inflow Bonus" amount={userData.inflowBonus} color="text-green-400" onClick={() => { setShowBalances(false); router.push("/inflow"); }} />
                      <BalanceItem label="Sign-up Rewards" amount={userData.signupRewards} color="text-green-400" icon={<Gift size={11} />}
                        onClick={() => { setShowBalances(false); router.push("/referrals/signups"); }} />
                      
                      {userData.isAgent ? (
                        <BalanceItem label="Agent Balance" amount={userData.agentBalance} color="text-[#F5F3EE]" />
                      ) : (
                        Number(userData.gameCredits) > 0 && (
                          <BalanceItem label="Active Stakes" amount={userData.gameCredits} color="text-[#F5F3EE]" />
                        )
                      )}
                  </div>

                  <div className="space-y-2">
                    {userData.isAgent && (
                      <button 
                        onClick={handleAgentDashboardClick}
                        className="w-full bg-[#2457D6] hover:bg-[#1D4FC4] py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-[#2457D6]/20 active:scale-95 flex items-center justify-center space-x-2 border border-white/10"
                      >
                        <LayoutDashboard size={14} />
                        <span>Agent Dashboard</span>
                      </button>
                    )}

                    <button 
                      onClick={handleTransferClick}
                      className="w-full bg-[#2457D6] hover:bg-[#1D4FC4] py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-[#2457D6]/20 active:scale-95 flex items-center justify-center space-x-2"
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
                      className="w-full bg-[#8B1E3F] hover:bg-[#A62A4D] py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-[#8B1E3F]/20 active:scale-95"
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
                      onClick={handleInflowClick}
                      className="w-full bg-white/5 hover:bg-white/10 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center space-x-2 border border-white/5"
                    >
                      <TrendingUp size={14} className="text-green-400" />
                      <span>Inflow Bonus</span>
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
    </>
  );
}

/** A balance line; with `onClick` it opens that balance's page. */
function BalanceItem({ label, amount, color, icon, onClick }) {
  const Row = onClick ? "button" : "div";
  return (
    <Row onClick={onClick} className={`w-full flex justify-between items-center last:border-0 ${onClick ? "hover:opacity-80" : ""}`}>
      <span className="text-[9px] uppercase font-black text-[#F5F3EE]/50 tracking-wider">{label}</span>
      <span className={`font-bold flex items-center gap-1 ${color}`}>{icon}${amount}</span>
    </Row>
  );
}
