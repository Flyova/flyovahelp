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
  Activity,
  CheckCircle2,
  XCircle,
  Loader2
} from "lucide-react";

export default function PredictAndWinHistory() {
  const [predictions, setPredictions] = useState([]);
  const [userCache, setUserCache] = useState({}); // Stores { userId: fullName }
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Queries the sub-collection 'transactions' for type "prediction"
    const q = query(
      collectionGroup(db, "transactions"),
      where("type", "==", "prediction"),
      orderBy("timestamp", "desc")
    );

    const unsub = onSnapshot(q, async (snap) => {
      const predictionData = snap.docs.map(d => {
        // Extract userId from the path: users/{userId}/transactions/{docId}
        const pathSegments = d.ref.path.split('/');
        const userIdFromPath = pathSegments[1];

        return {
          id: d.id,
          userId: userIdFromPath,
          ...d.data()
        };
      });

      // 2. Resolve Names for unique users found in these transactions
      const uniqueUserIds = [...new Set(predictionData.map(p => p.userId))].filter(uid => !userCache[uid]);
      
      if (uniqueUserIds.length > 0) {
        const nameLookups = await Promise.all(uniqueUserIds.map(async (uid) => {
          const userRef = doc(db, "users", uid);
          const userSnap = await getDoc(userRef);
          
          if (userSnap.exists()) {
              return { uid, name: userSnap.data().fullName || "No Name Set" };
          }
          return { uid, name: "Unknown User" };
        }));

        const newNames = {};
        nameLookups.forEach(res => {
          if (res) newNames[res.uid] = res.name;
        });

        setUserCache(prev => ({ ...prev, ...newNames }));
      }

      setPredictions(predictionData);
      setLoading(false);
    });

    return () => unsub();
  }, [userCache]);

  const filteredPredictions = predictions.filter(p => {
    const fullName = userCache[p.userId] || "";
    const search = searchTerm.toLowerCase();
    return fullName.toLowerCase().includes(search) || 
           p.gameId?.toLowerCase().includes(search) ||
           p.userId.toLowerCase().includes(search);
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black italic uppercase text-slate-800">Predict & Win Log</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Subscription-based prediction tracking</p>
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
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Player (Full Name)</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Game ID</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Prediction</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Status</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && predictions.length === 0 ? (
                <tr>
                    <td colSpan="5" className="p-12 text-center">
                        <Loader2 className="animate-spin mx-auto text-[#613de6] mb-2" />
                        <p className="text-[10px] font-black uppercase text-slate-400">Loading Predictions...</p>
                    </td>
                </tr>
            ) : filteredPredictions.length === 0 ? (
              <tr>
                <td colSpan="5" className="p-20 text-center text-slate-300 font-black italic uppercase tracking-widest">No Predictions Found</td>
              </tr>
            ) : (
              filteredPredictions.map((pred) => (
                <tr key={pred.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-6">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center font-black italic text-xs">
                            {(userCache[pred.userId] || "U").charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <p className="text-sm font-black italic text-slate-800 uppercase leading-none mb-1">
                                {userCache[pred.userId] || "Resolving Name..."}
                            </p>
                            <p className="text-[9px] font-mono text-slate-400 uppercase tracking-tighter">ID: {pred.userId}</p>
                        </div>
                    </div>
                  </td>
                  <td className="p-6">
                    <span className="text-[10px] font-mono font-bold text-slate-400">
                        {pred.gameId || "N/A"}
                    </span>
                  </td>
                  <td className="p-6 text-center">
                    <span className={`px-4 py-1.5 rounded-lg font-black text-[10px] uppercase italic border ${
                        pred.prediction === 'Both' ? 'bg-indigo-50 border-indigo-100 text-indigo-600' :
                        pred.prediction === 'Odd' ? 'bg-orange-50 border-orange-100 text-orange-600' :
                        'bg-slate-50 border-slate-100 text-slate-600'
                    }`}>
                        {pred.prediction}
                    </span>
                  </td>
                  <td className="p-6 text-center">
                    <div className="flex justify-center">
                        {pred.status === 'win' ? (
                            <div className="flex items-center gap-1 text-emerald-500 font-black text-[10px] uppercase tracking-tighter">
                                <CheckCircle2 size={14} /> Won Reward
                            </div>
                        ) : pred.status === 'loss' ? (
                            <div className="flex items-center gap-1 text-rose-400 font-black text-[10px] uppercase tracking-tighter">
                                <XCircle size={14} /> Lost
                            </div>
                        ) : (
                            <div className="flex items-center gap-1 text-slate-300 font-black text-[10px] uppercase tracking-tighter">
                                <Activity size={14} className="animate-pulse" /> Pending
                            </div>
                        )}
                    </div>
                  </td>
                  <td className="p-6 text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase">
                        {pred.timestamp?.toDate().toLocaleTimeString()}
                    </p>
                    <p className="text-[8px] font-bold text-slate-300">
                        {pred.timestamp?.toDate().toLocaleDateString()}
                    </p>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}