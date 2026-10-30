"use client";
import { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { authFetch } from "@/lib/authFetch";
import Avatar from "@/components/Avatar";
import {
  ChevronLeft,
  Copy,
  Check,
  Users,
  TrendingUp,
  UserCircle,
  Hash,
  Fingerprint,
  ArrowRightLeft,
  X,
  Loader2,
  CheckCircle2,
  Lock,
  Clock,
  Gift
} from "lucide-react";
import { useRouter } from "next/navigation";

const MIN_QUALIFIED_REFERRALS = 10;
const MIN_QUALIFYING_DEPOSIT = 25;

export default function ReferralsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [referralsChecked, setReferralsChecked] = useState(false);
  const [needed, setNeeded] = useState(MIN_QUALIFIED_REFERRALS); // the server's number: fewer for 18-month accounts
  const [code, setCode] = useState("");
  const [link, setLink] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);
  const [signup, setSignup] = useState({ reward: 0.0001, count: 0, total: 0 });
  const [claiming, setClaiming] = useState(false);

  // Withdraw Modal States
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) return router.push("/login");
      setUser(u);

      // Who you referred and whether each has made a qualifying deposit: worked out by
      // the server (players can't read other players' accounts or deposits).
      const fetchReferrals = async () => {
        try {
          const res = await authFetch("/api/wallet?view=referrals");
          if (res.error) throw new Error(res.error);
          setReferrals(res.referrals);
          if (res.needed) setNeeded(res.needed);
          setCode(res.code || "");
          setLink(res.link || "");
          setSignup({ reward: res.signupReward || 0.0001, count: res.signupRewards || 0, total: res.signupRewardsTotal || 0 });
        } catch (err) {
          console.error("Error fetching referrals:", err);
        } finally {
          setLoading(false);
          setReferralsChecked(true);
        }
      };
      fetchReferrals();

      const unsubUser = onSnapshot(doc(db, "users", u.uid), (snap) => {
        if (snap.exists()) {
          setUserData(snap.data());
        } else {
          setLoading(false);
        }
      });

      return () => unsubUser();
    });

    return () => unsubAuth();
  }, [router]);

  const shareLink = link || `https://strawins.com/register?ref=${user?.uid}`;
  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const handleCopyCode = () => {
    navigator.clipboard.writeText(code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  // Sign-up rewards are their own balance: $0.0001 per verified sign-up, moved to the
  // main wallet a whole cent at a time (the rest stays).
  const signupCount = userData?.signupRewards ?? signup.count;
  const signupValue = signupCount * signup.reward;
  const handleClaimSignup = async () => {
    setClaiming(true);
    try {
      const res = await authFetch("/api/wallet", { method: "POST", body: { action: "signupClaim" } });
      if (res.error) return alert(res.error);
      alert(`$${res.moved.toFixed(2)} moved to your main wallet.`);
    } finally {
      setClaiming(false);
    }
  };

  const qualifiedReferralsCount = referrals.filter((r) => r.hasDeposited).length;
  const canWithdrawBonus = qualifiedReferralsCount >= needed;

  const handleWithdrawBonus = async () => {
    const amount = parseFloat(withdrawAmount);
    const availableBonus = userData?.referralBonus || 0;

    if (!canWithdrawBonus) {
      return alert(
        `You need at least ${needed} referrals who have each deposited a minimum of $${MIN_QUALIFYING_DEPOSIT} before you can withdraw your referral bonus. Currently: ${qualifiedReferralsCount}/${needed}.`
      );
    }
    if (!amount || amount <= 0) return alert("Please enter a valid amount");
    if (amount > availableBonus) return alert("Insufficient referral bonus balance");
    if (amount < 1) return alert("Minimum withdrawal is $1.00");

    setWithdrawLoading(true);
    try {
      // The server checks the qualified referrals and the bonus balance again.
      const res = await authFetch("/api/wallet", { method: "POST", body: { action: "referral", amount } });
      if (res.error) return alert(res.error);

      setShowWithdrawModal(false);
      setWithdrawAmount("");
      alert("Bonus successfully transferred to main wallet!");
    } catch (err) {
      console.error(err);
      alert("Transfer failed. Please try again.");
    } finally {
      setWithdrawLoading(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#0B1220] flex items-center justify-center">
      <div className="font-black italic text-white animate-pulse uppercase tracking-widest">Loading Network...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0B1220] text-white flex flex-col pb-12">
      
      {/* HEADER */}
      <div className="p-6 pt-12 flex items-center gap-4 max-w-md mx-auto w-full">
        <button 
          onClick={() => router.back()} 
          className="p-3 bg-[#142036] rounded-2xl border border-white/5 active:scale-90 transition-all"
        >
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-xl font-black italic uppercase tracking-tighter"> Referral Bonuses</h1>
      </div>

      <div className="p-6 space-y-6 max-w-md mx-auto w-full">
        
        {/* EARNINGS CARD */}
        <div className="bg-gradient-to-br from-[#2457D6] to-[#1D4FC4] p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
            <TrendingUp className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 rotate-12" />
            <div className="flex justify-between items-start relative z-10">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60 mb-1">Referral Balance</p>
                    <h2 className="text-5xl font-black italic tracking-tighter">
                        ${userData?.referralBonus?.toFixed(2) || "0.00"}
                    </h2>
                </div>
                <button
                  onClick={() => setShowWithdrawModal(true)}
                  className="bg-white/10 px-4 py-2.5 rounded-2xl border border-white/20 hover:bg-white/20 transition-all flex items-center gap-2"
                >
                  {canWithdrawBonus ? <ArrowRightLeft size={16} /> : <Lock size={16} />}
                  <span className="text-[10px] font-black uppercase tracking-widest">Transfer</span>
                </button>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2 relative z-10">
                <div className="inline-flex items-center bg-black/20 px-4 py-2 rounded-full border border-white/10">
                    <Users size={14} className="mr-2 text-green-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest">
                        {referrals.length} Active Referrals
                    </span>
                </div>
                <div className={`inline-flex items-center px-4 py-2 rounded-full border ${canWithdrawBonus ? "bg-emerald-500/20 border-emerald-400/30" : "bg-black/20 border-white/10"}`}>
                    {canWithdrawBonus ? <CheckCircle2 size={14} className="mr-2 text-emerald-400" /> : <Lock size={14} className="mr-2 text-white/40" />}
                    <span className="text-[10px] font-black uppercase tracking-widest">
                        {qualifiedReferralsCount}/{needed} Deposited
                    </span>
                </div>
            </div>
        </div>

        <p className="text-[11px] font-bold text-white/50 leading-relaxed px-2">
          Your referral balance unlocks once {needed} of your referrals have each deposited at least ${MIN_QUALIFYING_DEPOSIT}
          {needed < MIN_QUALIFIED_REFERRALS ? " (fewer for accounts over 18 months old)" : ""}.
        </p>

        {/* SIGN-UP REWARDS: their own balance and button */}
        <div className="bg-[#142036] rounded-[2rem] p-6 border border-white/5 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Gift size={18} className="text-[#8B1E3F]" />
              <h3 className="font-black italic uppercase text-sm">Sign-up Rewards</h3>
            </div>
            <p className="text-2xl font-black italic">${signupValue.toFixed(4)}</p>
          </div>
          <p className="text-[10px] text-white/50 my-3 font-bold leading-relaxed">
            You get ${signup.reward} for everyone who signs up with your link or code and verifies their email.
            {" "}{signupCount} unclaimed · {userData?.signupRewardsTotal ?? signup.total} all time. Moves to your wallet from $0.01.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => router.push("/referrals/signups")}
              className="bg-white/5 border border-white/10 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2">
              <Users size={14} /> Who Signed Up
            </button>
            <button onClick={handleClaimSignup} disabled={claiming || signupValue < 0.01}
              className="bg-[#2457D6] py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 disabled:opacity-30">
              {claiming ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />} Move to Wallet
            </button>
          </div>
        </div>

        {/* REFERRAL CODE SECTION */}
        <div className="bg-[#142036] rounded-[2rem] p-6 border border-white/5 shadow-xl">
          <div className="flex items-center space-x-2 mb-4">
            <Hash size={18} className="text-[#8B1E3F]" />
            <h3 className="font-black italic uppercase text-sm">Your Referral Code &amp; Link</h3>
          </div>
          {code && (
            <div className="flex items-center justify-between bg-black/40 p-3 pl-5 rounded-2xl border border-white/10 gap-2 mb-3">
              <p className="font-mono text-xl font-black tracking-[0.3em]">{code}</p>
              <button onClick={handleCopyCode} className={`px-4 py-3 rounded-xl transition-all shrink-0 ${codeCopied ? 'bg-green-500' : 'bg-[#2457D6]'} text-white shadow-lg`}>
                {codeCopied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          )}
          <div className="flex items-center bg-black/40 p-3 rounded-2xl border border-white/10 gap-2">
            <div className="bg-[#0B1220] px-3 py-2 rounded-xl flex-1 border border-white/5 overflow-hidden">
                <p className="text-[10px] font-mono text-white/40 truncate">
                    {shareLink.replace(/^https:\/\//, "")}
                </p>
            </div>
            <button 
                onClick={handleCopyLink} 
                className={`px-4 py-3 rounded-xl transition-all shrink-0 ${copied ? 'bg-green-500' : 'bg-[#2457D6]'} text-white shadow-lg`}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        </div>

        {/* REFERRALS LIST */}
        <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
                <h3 className="font-black italic uppercase text-xs text-white/40 tracking-widest">Downline Members</h3>
            </div>

            {referrals.length === 0 ? (
                <div className="bg-[#142036] rounded-[2rem] p-12 border border-dashed border-white/10 text-center">
                    <UserCircle size={48} className="mx-auto mb-4 text-white/5" />
                    <p className="text-[10px] font-black uppercase text-white/20 tracking-widest">No referrals yet</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {referrals.map((ref) => (
                        <div key={ref.id} className="bg-[#142036] rounded-3xl p-5 border border-white/5 flex items-center justify-between group hover:border-[#2457D6]/30 transition-all">
                            <div className="flex items-center gap-4">
                                <Avatar username={ref.username} size={48} rounded="rounded-2xl" className="border border-white/5" />
                                <div>
                                    <h4 className="font-black italic uppercase text-[#8B1E3F] leading-none">
                                        @{ref.username}
                                    </h4>
                                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-tighter mb-1">
                                        {ref.fullName}
                                    </p>
                                    <div className="flex items-center gap-1.5 opacity-40">
                                        <Fingerprint size={10} />
                                        <span className="text-[10px] font-mono font-bold tracking-wider">
                                            PIN: {ref.pin || "----"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            {!referralsChecked ? (
                                <div className="bg-white/5 px-3 py-1.5 rounded-lg border border-white/10">
                                    <Loader2 size={12} className="animate-spin text-white/30" />
                                </div>
                            ) : ref.hasDeposited ? (
                                <div className="bg-green-500/10 px-3 py-1.5 rounded-lg border border-green-500/20">
                                    <span className="text-[8px] font-black text-green-500 uppercase tracking-tighter italic">Deposited</span>
                                </div>
                            ) : (
                                <div className="bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20 flex items-center gap-1">
                                    <Clock size={10} className="text-amber-400" />
                                    <span className="text-[8px] font-black text-amber-400 uppercase tracking-tighter italic">Awaiting Deposit</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>

      </div>

      {/* WITHDRAW MODAL */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-[#0B1220]/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[#142036] w-full max-w-sm rounded-[2.5rem] border border-white/10 p-8 shadow-2xl space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-black italic uppercase tracking-tighter">Withdraw Bonus</h2>
              <button onClick={() => setShowWithdrawModal(false)} className="p-2 bg-white/5 rounded-xl"><X size={20} /></button>
            </div>

            {!canWithdrawBonus ? (
              <>
                <div className="bg-amber-500/10 border border-amber-500/20 p-6 rounded-3xl text-center space-y-3">
                  <Lock size={32} className="mx-auto text-amber-400" />
                  <p className="text-sm font-black italic uppercase text-white">Withdrawal Locked</p>
                  <p className="text-[11px] font-bold text-gray-400 leading-relaxed">
                    You need at least {needed} referrals who have each deposited a minimum of ${MIN_QUALIFYING_DEPOSIT} before you can move your referral bonus to your Main Wallet.
                  </p>
                  <div className="bg-black/20 px-4 py-2 rounded-full border border-white/10 inline-flex items-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white">
                      {qualifiedReferralsCount}/{needed} Referrals Deposited
                    </span>
                  </div>
                </div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">
                  Share your referral link and encourage your downline to deposit to unlock this.
                </p>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.1em]">Transfer Amount</p>
                  <div className="bg-black/20 p-6 rounded-3xl border border-white/5 relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black italic text-[#2457D6]">$</span>
                    <input
                      type="number"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-transparent pl-6 text-3xl font-black italic text-white outline-none"
                    />
                  </div>
                  <p className="text-[9px] font-bold text-[#8B1E3F] uppercase px-2">
                    Available: ${userData?.referralBonus?.toFixed(2) || "0.00"}
                  </p>
                </div>

                <div className="bg-[#2457D6]/5 border border-[#2457D6]/20 p-5 rounded-3xl space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Destination</span>
                    <span className="text-[10px] font-black uppercase italic text-green-500">Main Wallet</span>
                  </div>
                </div>

                <button
                  onClick={handleWithdrawBonus}
                  disabled={withdrawLoading || !withdrawAmount}
                  className="w-full bg-[#2457D6] py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all disabled:opacity-40"
                >
                  {withdrawLoading ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <>CONFIRM TRANSFER <CheckCircle2 size={16} /></>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
