"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Play, Loader2, ShieldCheck, ArrowRight, Clock, ArrowUpRight } from "lucide-react";
// FIREBASE IMPORTS
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, collection, query, where, or } from "firebase/firestore";
import Header from "@/components/Header";

export default function Dashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [activeTrades, setActiveTrades] = useState([]);

  useEffect(() => {
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

        // MONITOR TRADES WHERE USER IS EITHER SENDER OR AGENT
        // FIX: Removed 'not-in' from the query to avoid the Firestore conflict with 'or'
        const qTrades = query(
          collection(db, "trades"),
          or(
            where("senderId", "==", currentUser.uid),
            where("agentId", "==", currentUser.uid)
          )
        );

        const unsubTrades = onSnapshot(qTrades, (snap) => {
          // FIX: Filter the status LOCALLY so we can keep the 'or' query valid
          const filtered = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(trade => !["completed", "cancelled"].includes(trade.status));
          
          setActiveTrades(filtered);
        }, (err) => {
          console.error("Firestore Query Error:", err);
        });

        return () => {
          unsubDoc();
          unsubTrades();
        };
      }
    });

    return () => unsubscribe();
  }, [router]);

  const topGames = [
    { id: 1, name: "Play with Friends", img: "/play_friends.svg", tag: "Hot", path: "/game/1" },
    { id: 2, name: "Flyova To Dollars", img: "/flytodols.svg", tag: "Cash", path: "/game/flyova-to-dollars" },
    { id: 3, name: "Predict and Win", img: "/predictwin.svg", tag: "New", path: "/game/predict-and-win" }
  ];

  const handleNavigation = (path) => {
    if (path !== "#") router.push(path);
  };

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
      
      {/* TRADE MONITOR OVERLAY */}
      {activeTrades.length > 0 && (
        <div className="px-4 pb-10 pt-10 space-y-2 mb-[-60px] relative z-40">
          {activeTrades.map((trade) => (
            <div 
              key={trade.id}
              onClick={() => router.push(`/trade/${trade.id}`)}
              className="bg-[#613de6] p-4 rounded-2xl flex items-center justify-between border border-white/20 shadow-2xl cursor-pointer hover:brightness-110 transition-all animate-in slide-in-from-top-4 duration-300"
            >
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg animate-pulse">
                  <Clock size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-white/70 uppercase leading-none mb-1">
                    {trade.agentId === user?.uid ? "Action Required: Incoming" : "Ongoing Trade"}
                  </p>
                  <p className="text-xs font-bold text-white uppercase italic tracking-tighter">
                    {trade.type}: <span className="text-orange-300">{trade.status}</span> (${trade.amount})
                  </p>
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
      <div className="p-4 pt-10"> 
        <div 
          onClick={() => handleNavigation('/game/1')}
          className="relative w-full h-44 rounded-3xl overflow-hidden bg-[#613de6] group cursor-pointer shadow-2xl border border-white/5"
        >
          <div className="absolute inset-0 opacity-40 group-hover:opacity-60 transition-opacity">
            <img src="/play_friends.svg" alt="Background" className="w-full h-full object-cover" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent" />
          <div className="absolute bottom-6 left-6 z-10">
            <h2 className="text-2xl font-black text-white italic leading-tight tracking-tighter">
              CHALLENGE FRIENDS<br/>
              <span className="text-[#fc7952]">WIN INSTANTLY</span>
            </h2>
            <button className="mt-3 bg-[#fc7952] text-white px-6 py-2 rounded-full text-xs font-black uppercase shadow-lg group-hover:scale-105 transition-all">
              Play Now
            </button>
          </div>
        </div>
      </div>

      {/* Search Section */}
      <div className="px-4 mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input 
            className="w-full bg-[#1e293b] border border-gray-800 p-4 pl-12 rounded-2xl text-sm focus:border-[#613de6] outline-none text-white font-bold transition-all" 
            placeholder="Search for games..." 
          />
        </div>
      </div>

      {/* Game Grid */}
      <div className="px-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-black text-white text-lg uppercase tracking-tighter italic">Featured Games</h3>
          <button className="text-[#fc7952] text-xs font-black uppercase tracking-widest hover:underline">View All</button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {topGames.map((game, index) => (
            <div 
              key={game.id} 
              onClick={() => handleNavigation(game.path)}
              className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-[#1e293b] border border-gray-800 active:scale-95 transition-all group cursor-pointer shadow-lg"
            >
              <div className="absolute top-0 left-0 bg-red-600 text-white font-black px-2.5 py-1 text-[10px] rounded-br-xl z-30 shadow-md italic">
                {index + 1}
              </div>
              <div className="absolute inset-0 z-10 overflow-hidden">
                <img src={game.img} alt={game.name} className="w-full h-full object-cover opacity-50 group-hover:opacity-100 transition-all duration-500 group-hover:scale-110" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent z-20" />
              <div className="absolute bottom-3 left-0 right-0 px-2 text-center z-30">
                <p className="text-[9px] font-black text-white uppercase truncate tracking-tighter mb-1">{game.name}</p>
                <div className="text-[7px] inline-block px-2 py-0.5 rounded-full font-black uppercase shadow-sm bg-[#fc7952] text-white">{game.tag}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Agent Section */}
      {userData && userData.isAgent !== true && (
        <div className="px-4 mt-8">
          <div className="relative bg-gradient-to-br from-[#1e293b] to-[#0f172a] p-6 rounded-[2rem] border border-[#613de6]/30 overflow-hidden group shadow-2xl">
            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-2 text-[#fc7952]">
                <ShieldCheck size={20} />
                <span className="text-[10px] font-black uppercase tracking-widest">Revenue Opportunity</span>
              </div>
              <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white">Become a <br/><span className="text-[#613de6]">Flyova Agent</span></h2>
              <p className="text-[11px] text-gray-400 font-bold leading-relaxed max-w-[200px]">Process user withdrawals in your region and earn commissions.</p>
              <button onClick={() => router.push('/agent/apply')} className="bg-[#613de6] hover:bg-[#7251ed] text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 active:scale-95 shadow-lg shadow-[#613de6]/20">Apply Now <ArrowRight size={14} /></button>
            </div>
            <ShieldCheck size={180} className="absolute -right-12 -bottom-12 opacity-[0.05] text-white group-hover:rotate-12 group-hover:scale-110 transition-transform duration-700" />
          </div>
        </div>
      )}
    </main>
  );
}