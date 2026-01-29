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
import { Search, Swords, Trophy, Loader2 } from "lucide-react";

export default function PlayWithFriendsHistory() {
  const [matches, setMatches] = useState([]);
  const [userCache, setUserCache] = useState({}); 
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // We query for "Round Win" specifically as the event type
    const q = query(
      collectionGroup(db, "transactions"),
      where("title", "==", "Round Win"),
      orderBy("timestamp", "desc")
    );

    const unsub = onSnapshot(q, async (snap) => {
      const transactionDocs = snap.docs.map(d => ({
        id: d.id,
        // Document Name/ID from the users collection
        userId: d.ref.path.split('/')[1], 
        ...d.data()
      }));

      // Find unique IDs that aren't in our name cache yet
      const uniqueUserIds = [...new Set(transactionDocs.map(t => t.userId))].filter(uid => !userCache[uid]);
      
      if (uniqueUserIds.length > 0) {
        const results = await Promise.all(uniqueUserIds.map(async (uid) => {
          const userSnap = await getDoc(doc(db, "users", uid));
          if (userSnap.exists()) {
            return { uid, name: userSnap.data().fullName || "No Name" };
          }
          return { uid, name: "Unknown User" };
        }));

        const newNames = {};
        results.forEach(res => { if(res) newNames[res.uid] = res.name });
        setUserCache(prev => ({ ...prev, ...newNames }));
      }

      setMatches(transactionDocs);
      setLoading(false);
    });

    return () => unsub();
  }, [userCache]);

  const filteredMatches = matches.filter(m => {
    const fullName = userCache[m.userId] || "";
    return fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
           m.userId.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black italic uppercase text-slate-800">Play With Friends</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              History of all "Round Win" occurrences
          </p>
        </div>
       
      </div>

      {/* SEARCH */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative">
        <Search className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input 
          type="text" 
          placeholder="Search Player Full Name or ID..." 
          className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:border-[#613de6]"
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Full Name / ID</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Event Type</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Amount</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Status</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && matches.length === 0 ? (
                <tr>
                    <td colSpan="5" className="p-12 text-center">
                        <Loader2 className="animate-spin mx-auto text-[#fc7952] mb-2" />
                        <p className="text-[10px] font-black uppercase text-slate-400">Syncing Winners...</p>
                    </td>
                </tr>
            ) : filteredMatches.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="p-6">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-slate-100 text-[#fc7952] rounded-xl flex items-center justify-center font-black italic text-xs border border-slate-200">
                        {(userCache[item.userId] || "U").charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <p className="text-sm font-black italic text-slate-800 uppercase leading-none mb-1">
                            {userCache[item.userId] || "Resolving Name..."}
                        </p>
                        <p className="text-[9px] font-mono text-slate-400 uppercase tracking-tighter">{item.userId}</p>
                    </div>
                  </div>
                </td>
                <td className="p-6">
                    <div className="flex items-center gap-2">
                        <Trophy size={14} className="text-amber-500" />
                        <span className="text-[10px] font-black uppercase text-slate-600 tracking-tighter">{item.title}</span>
                    </div>
                </td>
                <td className="p-6 text-center">
                    <p className="text-sm font-black italic text-emerald-600">+${item.amount}</p>
                </td>
                <td className="p-6 text-center">
                    <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-green-100 text-green-600">
                        {item.status}
                    </span>
                </td>
                <td className="p-6 text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase leading-tight">
                        {item.timestamp?.toDate().toLocaleDateString()}<br/>
                        <span className="text-[8px] opacity-60 font-bold">{item.timestamp?.toDate().toLocaleTimeString()}</span>
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