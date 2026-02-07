"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { 
  Search, Play, Loader2, ShieldCheck, ArrowRight, Clock, 
  ArrowUpRight, Megaphone, X, Info, AlertTriangle, 
  CheckCircle2, Heart, Send, Star, Trophy 
} from "lucide-react";
// FIREBASE IMPORTS
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { 
  doc, onSnapshot, collection, query, where, or, 
  orderBy, addDoc, serverTimestamp, updateDoc, limit, getDocs, increment
} from "firebase/firestore";
import Header from "@/components/Header";

export default function Dashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [activeTrades, setActiveTrades] = useState([]);
  
  // Jackpot State
  const [pendingJackpots, setPendingJackpots] = useState([]);
  const [claimingId, setClaimingId] = useState(null);
  
  // Testimonial States
  const [showModal, setShowModal] = useState(false);
  const [testimonialText, setTestimonialText] = useState("");
  const [submittingTestimonial, setSubmittingTestimonial] = useState(false);
  const [hasApprovedWithdrawal, setHasApprovedWithdrawal] = useState(false);

  // Announcement States
  const [announcements, setAnnouncements] = useState([]);
  const [readMessages, setReadMessages] = useState([]);

  useEffect(() => {
    const saved = localStorage.getItem("read_announcements");
    if (saved) setReadMessages(JSON.parse(saved));

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push("/login");
      } else {
        setUser(currentUser);
        
        // Fetch User Profile
        const userDocRef = doc(db, "users", currentUser.uid);
        const unsubDoc = onSnapshot(userDocRef, (snap) => {
          if (snap.exists()) {
            setUserData(snap.data());
          }
          setLoading(false);
        });

        // MONITOR PENDING JACKPOTS
        const qJackpot = query(
          collection(db, "jackpots"), 
          where("userId", "==", currentUser.uid),
          where("status", "==", "pending")
        );
        const unsubJackpot = onSnapshot(qJackpot, (snap) => {
          setPendingJackpots(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const checkWithdrawals = async () => {
            const q = query(
                collection(db, "withdrawals"), 
                where("userId", "==", currentUser.uid),
                where("status", "==", "approved"),
                limit(1)
            );
            const snap = await getDocs(q);
            if (!snap.empty) setHasApprovedWithdrawal(true);
        };
        checkWithdrawals();

        // MONITOR ANNOUNCEMENTS
        const qAnnounce = query(collection(db, "broadcasts"), orderBy("timestamp", "desc"));
        const unsubAnnounce = onSnapshot(qAnnounce, (snap) => {
          setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // MONITOR TRADES
        const qTrades = query(
          collection(db, "trades"),
          or(where("senderId", "==", currentUser.uid), where("agentId", "==", currentUser.uid))
        );

        const unsubTrades = onSnapshot(qTrades, (snap) => {
          const filtered = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(trade => !["completed", "cancelled"].includes(trade.status));
          setActiveTrades(filtered);
        });

        return () => {
          unsubDoc();
          unsubTrades();
          unsubAnnounce();
          unsubJackpot();
        };
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleClaimJackpot = async (jackpot) => {
    if (claimingId) return;
    setClaimingId(jackpot.id);

    try {
      // 1. Update user wallet
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        wallet: increment(jackpot.amount)
      });

      // 2. Mark jackpot as claimed
      const jackpotRef = doc(db, "jackpots", jackpot.id);
      await updateDoc(jackpotRef, {
        status: "claimed",
        claimedAt: serverTimestamp()
      });

      alert(`Congratulations! $${jackpot.amount} has been added to your wallet.`);
    } catch (e) {
      console.error(e);
      alert("Error claiming jackpot.");
    } finally {
      setClaimingId(null);
    }
  };

  const handleTestimonialSubmit = async () => {
    if (!testimonialText.trim()) return;
    setSubmittingTestimonial(true);

    try {
      await addDoc(collection(db, "withdrawal_testimonials"), {
        userId: user.uid,
        userName: userData?.fullName || userData?.username || "A Player",
        message: testimonialText,
        timestamp: serverTimestamp(),
        approved: false 
      });

      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        testimonialSubmitted: true 
      });

      setTestimonialText("");
      setShowModal(false);
      alert("Thank you! Your review has been submitted.");
    } catch (e) {
      console.error(e);
      alert("Error submitting review.");
    } finally {
      setSubmittingTestimonial(false);
    }
  };

  const markAsRead = (id) => {
    const updated = [...readMessages, id];
    setReadMessages(updated);
    localStorage.setItem("read_announcements", JSON.stringify(updated));
  };

  const handleNavigation = (path) => { if (path !== "#") router.push(path); };

  const topGames = [
    { id: 1, name: "Play with Friends", img: "/play_friends.svg", tag: "Hot", path: "/game/1" },
    { id: 2, name: "Flyova To Dollars", img: "/flytodols.svg", tag: "Cash", path: "/game/flyova-to-dollars" },
    { id: 3, name: "Predict and Win", img: "/predictwin.svg", tag: "New", path: "/game/predict-and-win" }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center text-white">
        <Loader2 className="animate-spin text-[#613de6] mb-4" size={40} />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-50">Loading Dashboard...</p>
      </div>
    );
  }

  return (
    <main className="pb-24 bg-[#0f172a] min-h-screen animate-in fade-in duration-500">
      
      {/* TESTIMONIAL MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="bg-[#1e293b] w-full max-w-sm rounded-[2.5rem] border border-white/10 p-8 relative z-10 animate-in zoom-in-95 duration-300">
            <button onClick={() => setShowModal(false)} className="absolute top-6 right-6 text-gray-500 hover:text-white">
              <X size={20} />
            </button>
            <div className="text-center mb-6">
              <div className="bg-emerald-500 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20">
                <Star size={30} className="text-white fill-current" />
              </div>
              <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">Leave a Review</h3>
              <p className="text-xs font-bold text-gray-400 mt-2">Share your experience with the community!</p>
            </div>
            <textarea 
              value={testimonialText}
              onChange={(e) => setTestimonialText(e.target.value)}
              placeholder="Write your testimonial here..."
              className="w-full bg-black/20 border border-white/5 rounded-2xl p-4 text-sm font-bold text-white outline-none focus:border-emerald-500/50 transition-all h-32 mb-4 placeholder:opacity-20 shadow-inner"
            />
            <button 
              onClick={handleTestimonialSubmit}
              disabled={submittingTestimonial || !testimonialText.trim()}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 disabled:opacity-30 flex items-center justify-center gap-2"
            >
              {submittingTestimonial ? <Loader2 size={16} className="animate-spin" /> : "Submit Review"}
            </button>
          </div>
        </div>
      )}

      {/* JACKPOT ALERTS */}
      <div className="px-4 pt-10 space-y-2 relative z-50">
        {pendingJackpots.map((jackpot) => (
          <div key={jackpot.id} className="p-5 rounded-[2rem] border bg-amber-500 border-amber-400 flex items-center justify-between gap-4 shadow-2xl animate-bounce-subtle">
             <div className="flex items-start gap-3">
               <div className="bg-white/20 p-2.5 rounded-xl">
                 <Trophy size={20} className="text-white fill-current" />
               </div>
               <div>
                 <p className="text-[10px] font-black text-white/60 uppercase tracking-widest mb-1">BONUS DROPPED!</p>
                 <p className="text-sm font-black text-white leading-tight">You received a ${jackpot.amount} Jackpot!</p>
               </div>
             </div>
             <button 
               onClick={() => handleClaimJackpot(jackpot)}
               disabled={claimingId === jackpot.id}
               className="bg-white text-amber-600 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase whitespace-nowrap shadow-lg active:scale-90 transition-all flex items-center gap-2"
             >
               {claimingId === jackpot.id ? <Loader2 size={12} className="animate-spin" /> : "Claim Now"}
             </button>
          </div>
        ))}
      </div>

      {/* WITHDRAWAL BANNER */}
      {hasApprovedWithdrawal && userData?.testimonialSubmitted !== true && (
        <div className="px-4 pt-4 relative z-50">
           <div className="p-5 rounded-[2rem] border bg-emerald-600 border-emerald-500 flex items-center justify-between gap-4 shadow-2xl animate-in slide-in-from-top duration-500">
              <div className="flex items-start gap-3">
                <div className="bg-white/10 p-2.5 rounded-xl">
                  <Heart size={18} className="text-white fill-current" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-1">Payout Success</p>
                  <p className="text-sm font-bold text-white leading-tight">Tell us about your recent withdrawal? Share the love!</p>
                </div>
              </div>
              <button 
                onClick={() => setShowModal(true)}
                className="bg-white text-emerald-600 px-4 py-2 rounded-xl text-[9px] font-black uppercase whitespace-nowrap shadow-lg active:scale-90 transition-all"
              >
                Leave a Review
              </button>
           </div>
        </div>
      )}

      {/* ANNOUNCEMENT OVERLAY */}
      <div className="px-4 pt-4 space-y-2 relative z-50">
        {announcements
          .filter(msg => !readMessages.includes(msg.id))
          .map((msg) => (
            <div key={msg.id} className={`p-5 rounded-[2rem] border flex items-start justify-between gap-4 shadow-2xl ${msg.type === 'warning' ? 'bg-amber-500 border-amber-400' : msg.type === 'success' ? 'bg-emerald-600 border-emerald-500' : 'bg-[#1e293b] border-white/10'}`}>
              <div className="flex items-start gap-3">
                <div className="bg-white/10 p-2.5 rounded-xl mt-1">
                  {msg.type === 'warning' ? <AlertTriangle size={18} className="text-white" /> : 
                   msg.type === 'success' ? <CheckCircle2 size={18} className="text-white" /> : 
                   <Megaphone size={18} className="text-[#613de6]" />}
                </div>
                <div>
                  <p className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-1">Announcement</p>
                  <p className="text-sm font-bold text-white leading-tight">{msg.message}</p>
                </div>
              </div>
              <button onClick={() => markAsRead(msg.id)} className="bg-white/10 p-2 rounded-full transition-colors"><X size={16} className="text-white" /></button>
            </div>
          ))}
      </div>

      {/* TRADE MONITOR OVERLAY */}
      {activeTrades.length > 0 && (
        <div className="px-4 pt-4 space-y-2 relative z-40">
          {activeTrades.map((trade) => (
            <div key={trade.id} onClick={() => router.push(`/trade/${trade.id}`)} className="bg-[#613de6] p-4 rounded-2xl flex items-center justify-between border border-white/20 shadow-2xl cursor-pointer hover:brightness-110 transition-all">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg animate-pulse"><Clock size={18} className="text-white" /></div>
                <div>
                  <p className="text-[10px] font-black text-white/70 uppercase mb-1">{trade.agentId === user?.uid ? "Action Required" : "Ongoing Trade"}</p>
                  <p className="text-xs font-bold text-white uppercase italic tracking-tighter">{trade.type}: <span className="text-orange-300">{trade.status}</span> (${trade.amount})</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-black/20 px-3 py-2 rounded-xl">
                 <span className="text-[9px] font-black text-white uppercase">Enter Room</span>
                 <ArrowUpRight size={14} className="text-white" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Top Banner */}
      <div className="p-4 pt-2"> 
        <div onClick={() => handleNavigation('/game/1')} className="relative w-full h-44 rounded-3xl overflow-hidden bg-[#613de6] group cursor-pointer shadow-2xl border border-white/5">
          <div className="absolute inset-0 opacity-40 group-hover:opacity-60 transition-opacity"><img src="/play_friends.svg" alt="Background" className="w-full h-full object-cover" /></div>
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent" />
          <div className="absolute bottom-6 left-6 z-10">
            <h2 className="text-2xl font-black text-white italic leading-tight tracking-tighter">CHALLENGE FRIENDS<br/><span className="text-[#fc7952]">WIN INSTANTLY</span></h2>
            <button className="mt-3 bg-[#fc7952] text-white px-6 py-2 rounded-full text-xs font-black uppercase shadow-lg group-hover:scale-105 transition-all">Play Now</button>
          </div>
        </div>
      </div>

      <div className="px-4 mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input className="w-full bg-[#1e293b] border border-gray-800 p-4 pl-12 rounded-2xl text-sm focus:border-[#613de6] outline-none text-white font-bold" placeholder="Search for games..." />
        </div>
      </div>

      <div className="px-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-black text-white text-lg uppercase tracking-tighter italic">Featured Games</h3>
          <button className="text-[#fc7952] text-xs font-black uppercase tracking-widest hover:underline">View All</button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {topGames.map((game, index) => (
            <div key={game.id} onClick={() => handleNavigation(game.path)} className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-[#1e293b] border border-gray-800 group cursor-pointer shadow-lg">
              <div className="absolute top-0 left-0 bg-red-600 text-white font-black px-2.5 py-1 text-[10px] rounded-br-xl z-30 shadow-md italic">{index + 1}</div>
              <div className="absolute inset-0 z-10 overflow-hidden"><img src={game.img} alt={game.name} className="w-full h-full object-cover opacity-50 group-hover:opacity-100 transition-all duration-500 group-hover:scale-110" /></div>
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent z-20" />
              <div className="absolute bottom-3 left-0 right-0 px-2 text-center z-30">
                <p className="text-[9px] font-black text-white uppercase truncate tracking-tighter mb-1">{game.name}</p>
                <div className="text-[7px] inline-block px-2 py-0.5 rounded-full font-black uppercase shadow-sm bg-[#fc7952] text-white">{game.tag}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {userData && userData.isAgent !== true && (
        <div className="px-4 mt-8">
          <div className="relative bg-gradient-to-br from-[#1e293b] to-[#0f172a] p-6 rounded-[2rem] border border-[#613de6]/30 overflow-hidden group shadow-2xl">
            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-2 text-[#fc7952]"><ShieldCheck size={20} /><span className="text-[10px] font-black uppercase tracking-widest">Revenue Opportunity</span></div>
              <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white">Become a <br/><span className="text-[#613de6]">Flyova Agent</span></h2>
              <p className="text-[11px] text-gray-400 font-bold leading-relaxed max-w-[200px]">Process user withdrawals in your region and earn commissions.</p>
              <button onClick={() => router.push('/agent/apply')} className="bg-[#613de6] hover:bg-[#7251ed] text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center shadow-lg">Apply Now <ArrowRight size={14} /></button>
            </div>
            <ShieldCheck size={180} className="absolute -right-12 -bottom-12 opacity-[0.05] text-white" />
          </div>
        </div>
      )}
    </main>
  );
}