"use client";
import { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import { 
  doc, onSnapshot, collection, query, where, getDocs, updateDoc, increment, addDoc, serverTimestamp 
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
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
  CheckCircle2
} from "lucide-react";
import { useRouter } from "next/navigation";

export default function ReferralsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Withdraw Modal States
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) return router.push("/login");
      setUser(u);
      
      const unsubUser = onSnapshot(doc(db, "users", u.uid), (snap) => {
        if (snap.exists()) {
          setUserData(snap.data());
        }
      });

      const fetchReferrals = async () => {
        try {
          const q = query(
            collection(db, "users"), 
            where("referredBy", "==", u.uid)
          );
          const snap = await getDocs(q);
          const list = snap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setReferrals(list);
        } catch (err) {
          console.error("Error fetching referrals:", err);
        } finally {
          setLoading(false);
        }
      };

      fetchReferrals();
      return () => unsubUser();
    });

    return () => unsubAuth();
  }, [router]);

  const handleCopyLink = () => {
    const link = `https://flyovahelp.com/register?ref=${user.uid}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWithdrawBonus = async () => {
    const amount = parseFloat(withdrawAmount);
    const availableBonus = userData?.referralBonus || 0;

    if (!amount || amount <= 0) return alert("Please enter a valid amount");
    if (amount > availableBonus) return alert("Insufficient referral bonus balance");
    if (amount < 1) return alert("Minimum withdrawal is $1.00");

    setWithdrawLoading(true);
    try {
      const userRef = doc(db, "users", user.uid);
      
      await updateDoc(userRef, {
        referralBonus: increment(-amount),
        wallet: increment(amount)
      });

      await addDoc(collection(db, "users", user.uid, "transactions"), {
        title: "Referral Bonus Withdrawal",
        amount: amount,
        type: "referral_withdrawal",
        status: "completed",
        timestamp: serverTimestamp(),
        description: `Transferred $${amount} from referral bonus to main wallet`
      });

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
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
      <div className="font-black italic text-white animate-pulse uppercase tracking-widest">Loading Network...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col pb-12">
      
      {/* HEADER */}
      <div className="p-6 pt-12 flex items-center gap-4 max-w-md mx-auto w-full">
        <button 
          onClick={() => router.back()} 
          className="p-3 bg-[#1e293b] rounded-2xl border border-white/5 active:scale-90 transition-all"
        >
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-xl font-black italic uppercase tracking-tighter"> Referral Bonuses</h1>
      </div>

      <div className="p-6 space-y-6 max-w-md mx-auto w-full">
        
        {/* EARNINGS CARD */}
        <div className="bg-gradient-to-br from-[#613de6] to-[#4c2bb3] p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
            <TrendingUp className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 rotate-12" />
            <div className="flex justify-between items-start relative z-10">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60 mb-1">Referral Balance</p>
                    <h2 className="text-5xl font-black italic tracking-tighter">
                        ${userData?.referralBonus?.toFixed(2) || "0.00"}
                    </h2>
                </div>
                {/* Updated Button with Label */}
                <button 
                  onClick={() => setShowWithdrawModal(true)}
                  className="bg-white/10 px-4 py-2.5 rounded-2xl border border-white/20 hover:bg-white/20 transition-all flex items-center gap-2"
                >
                  <ArrowRightLeft size={16} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Transfer</span>
                </button>
            </div>
            <div className="mt-6 inline-flex items-center bg-black/20 px-4 py-2 rounded-full border border-white/10 relative z-10">
                <Users size={14} className="mr-2 text-green-400" />
                <span className="text-[10px] font-black uppercase tracking-widest">
                    {referrals.length} Active Referrals
                </span>
            </div>
        </div>

        {/* REFERRAL CODE SECTION */}
        <div className="bg-[#1e293b] rounded-[2rem] p-6 border border-white/5 shadow-xl">
          <div className="flex items-center space-x-2 mb-4">
            <Hash size={18} className="text-[#fc7952]" />
            <h3 className="font-black italic uppercase text-sm">Your Referral Link</h3>
          </div>
          <div className="flex items-center bg-black/40 p-3 rounded-2xl border border-white/10 gap-2">
            <div className="bg-[#0f172a] px-3 py-2 rounded-xl flex-1 border border-white/5 overflow-hidden">
                <p className="text-[10px] font-mono text-white/40 truncate">
                    flyovahelp.com/register?ref={user?.uid}
                </p>
            </div>
            <button 
                onClick={handleCopyLink} 
                className={`px-4 py-3 rounded-xl transition-all shrink-0 ${copied ? 'bg-green-500' : 'bg-[#613de6]'} text-white shadow-lg`}
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
                <div className="bg-[#1e293b] rounded-[2rem] p-12 border border-dashed border-white/10 text-center">
                    <UserCircle size={48} className="mx-auto mb-4 text-white/5" />
                    <p className="text-[10px] font-black uppercase text-white/20 tracking-widest">No referrals yet</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {referrals.map((ref) => (
                        <div key={ref.id} className="bg-[#1e293b] rounded-3xl p-5 border border-white/5 flex items-center justify-between group hover:border-[#613de6]/30 transition-all">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-black/40 rounded-2xl flex items-center justify-center text-xl font-black italic text-[#613de6] border border-white/5">
                                    {ref.username?.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <h4 className="font-black italic uppercase text-[#fc7952] leading-none mb-1">
                                        @{ref.username}
                                    </h4>
                                    <div className="flex items-center gap-1.5 opacity-40">
                                        <Fingerprint size={10} />
                                        <span className="text-[10px] font-mono font-bold tracking-wider">
                                            PIN: {ref.pin || "----"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-green-500/10 px-3 py-1.5 rounded-lg border border-green-500/20">
                                <span className="text-[8px] font-black text-green-500 uppercase tracking-tighter italic">Verified</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>

      </div>

      {/* WITHDRAW MODAL */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-[#0f172a]/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[#1e293b] w-full max-w-sm rounded-[2.5rem] border border-white/10 p-8 shadow-2xl space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-black italic uppercase tracking-tighter">Withdraw Bonus</h2>
              <button onClick={() => setShowWithdrawModal(false)} className="p-2 bg-white/5 rounded-xl"><X size={20} /></button>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.1em]">Transfer Amount</p>
              <div className="bg-black/20 p-6 rounded-3xl border border-white/5 relative">
                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black italic text-[#613de6]">$</span>
                <input 
                  type="number" 
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent pl-6 text-3xl font-black italic text-white outline-none"
                />
              </div>
              <p className="text-[9px] font-bold text-[#fc7952] uppercase px-2">
                Available: ${userData?.referralBonus?.toFixed(2) || "0.00"}
              </p>
            </div>

            <div className="bg-[#613de6]/5 border border-[#613de6]/20 p-5 rounded-3xl space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Destination</span>
                <span className="text-[10px] font-black uppercase italic text-green-500">Main Wallet</span>
              </div>
            </div>

            <button 
              onClick={handleWithdrawBonus}
              disabled={withdrawLoading || !withdrawAmount}
              className="w-full bg-[#613de6] py-5 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all"
            >
              {withdrawLoading ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <>CONFIRM TRANSFER <CheckCircle2 size={16} /></>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}