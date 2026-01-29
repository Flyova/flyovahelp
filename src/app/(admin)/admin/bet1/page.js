"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { 
  collectionGroup, 
  query, 
  where, 
  onSnapshot, 
  orderBy,
  doc,
  getDoc
} from "firebase/firestore";
import { 
  Search, 
  Timer, 
  Hash, 
  CheckCircle2,
  XCircle,
  Loader2,
  TrendingUp
} from "lucide-react";

export default function FlyovaHistory() {
  const [bets, setBets] = useState([]);
  const [userCache, setUserCache] = useState({}); // Stores { userId: fullName }
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Listen for Flyova specific transactions
    const q = query(
      collectionGroup(db, "transactions"),
      where("title", "in", ["Flyova Stake", "Flyova Win", "Flyova Win Payout"]),
      orderBy("timestamp", "desc")
    );

    const unsub = onSnapshot(q, async (snap) => {
      const betData = snap.docs.map(d => {
        const pathSegments = d.ref.path.split('/');
        const userIdFromPath = pathSegments[1];

        return {
          id: d.id,
          userId: userIdFromPath,
          ...d.data()
        };
      });

      // 2. Resolve Names for unique users
      const uniqueUserIds = [...new Set(betData.map(b => b.userId))].filter(uid => !userCache[uid]);
      
      if (uniqueUserIds.length > 0) {
        const nameLookups = await Promise.all(uniqueUserIds.map(async (uid) => {
          const userSnap = await getDoc(doc(db, "users", uid));
          return userSnap.exists() ? { uid, name: userSnap.data().fullName } : { uid, name: "Deleted User" };
        }));

        const newNames = {};
        nameLookups.forEach(res => { if(res) newNames[res.uid] = res.name });
        setUserCache(prev => ({ ...prev, ...newNames }));
      }

      setBets(betData);
      setLoading(false);
    });

    return () => unsub();
  }, [userCache]);

  const filteredBets = bets.filter(b => {
    const fullName = userCache[b.userId] || "";
    const search = searchTerm.toLowerCase();
    return fullName.toLowerCase().includes(search) || 
           b.gameId?.toLowerCase().includes(search) ||
           b.userId.toLowerCase().includes(search);
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black italic uppercase text-slate-800">Flyova to Dollars Log</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tracking number picks and stakes</p>
        </div>
       
      </div>

      {/* SEARCH */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative">
        <Search className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input 
          type="text" 
          placeholder="Search Player Full Name or Game ID..." 
          className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:border-[#613de6]"
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Player</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Game ID / Picks</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Stake/Win</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Status</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && bets.length === 0 ? (
                <tr>
                    <td colSpan="5" className="p-12 text-center">
                        <Loader2 className="animate-spin mx-auto text-[#613de6] mb-2" />
                        <p className="text-[10px] font-black uppercase text-slate-400">Loading Flyova Data...</p>
                    </td>
                </tr>
            ) : filteredBets.map((bet) => (
              <tr key={bet.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="p-6">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-50 text-[#613de6] rounded-lg flex items-center justify-center font-black italic text-xs border border-indigo-100">
                        {(userCache[bet.userId] || "U").charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <p className="text-sm font-black italic text-slate-800 uppercase leading-none mb-1">
                            {userCache[bet.userId] || "Resolving..."}
                        </p>
                        <p className="text-[9px] font-mono text-slate-400">ID: {bet.userId?.slice(-8)}</p>
                    </div>
                  </div>
                </td>
                <td className="p-6">
                    <p className="text-[10px] font-mono font-bold text-slate-400 leading-none mb-1">
                        #{bet.gameId?.slice(-6) || "N/A"}
                    </p>
                    <div className="flex gap-1">
                        {bet.picks?.map((num) => (
                            <span key={num} className="bg-slate-100 text-slate-600 text-[9px] font-black px-1.5 py-0.5 rounded border border-slate-200">
                                {num}
                            </span>
                        ))}
                    </div>
                </td>
                <td className="p-6 text-center">
                    <p className={`text-sm font-black italic ${bet.type === 'win' ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {bet.type === 'win' ? '+' : '-'}${bet.amount}
                    </p>
                </td>
                <td className="p-6 text-center">
                    <div className="flex justify-center">
                        {bet.status === 'win' ? (
                            <div className="flex items-center gap-1 text-emerald-500 font-black text-[9px] uppercase">
                                <CheckCircle2 size={12} /> Won
                            </div>
                        ) : bet.status === 'loss' ? (
                            <div className="flex items-center gap-1 text-rose-400 font-black text-[9px] uppercase">
                                <XCircle size={12} /> Lost
                            </div>
                        ) : (
                            <div className="flex items-center gap-1 text-amber-500 font-black text-[9px] uppercase">
                                <Timer size={12} className="animate-pulse" /> Pending
                            </div>
                        )}
                    </div>
                </td>
                <td className="p-6 text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase leading-tight">
                        {bet.timestamp?.toDate().toLocaleTimeString()}<br/>
                        <span className="text-[8px] opacity-60 font-bold">{bet.timestamp?.toDate().toLocaleDateString()}</span>
                    </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}