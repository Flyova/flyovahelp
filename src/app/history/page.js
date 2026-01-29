"use client";
import { useState, useEffect } from "react";
import { 
  ArrowDownLeft, 
  ArrowUpRight, 
  Swords, 
  History, 
  Trophy, 
  Coins, 
  Clock, 
  CheckCircle2, 
  XCircle,
  Loader2
} from "lucide-react";
// FIREBASE IMPORTS
import { auth, db } from "@/lib/firebase";
import { collection, query, onSnapshot, orderBy, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

export default function HistoryPage() {
  const [filter, setFilter] = useState("all");
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        // 1. STAKES & WINS (Sub-collection)
        const transRef = collection(db, "users", user.uid, "transactions");
        const qTrans = query(transRef, orderBy("timestamp", "desc"));

        // 2. DIRECT DEPOSITS
        const depositRef = collection(db, "deposits");
        const qDepo = query(depositRef, where("userId", "==", user.uid), orderBy("createdAt", "desc"));

        // 3. AGENT TRADES (Deposits and Withdrawals)
        const tradeRef = collection(db, "trades");
        const qTrade = query(tradeRef, where("senderId", "==", user.uid), orderBy("createdAt", "desc"));

        const unsubscribes = [];

        // Combine all listeners
        const syncData = () => {
          setLoading(true);
          
          // Using a simple object to merge and sort by date later
          let allData = [];

          const unsubTrans = onSnapshot(qTrans, (snap) => {
            const data = snap.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
              category: 'games',
              date: doc.data().timestamp?.toDate() || new Date()
            }));
            updateState(data, 'trans');
          });

          const unsubDepo = onSnapshot(qDepo, (snap) => {
            const data = snap.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
              title: "Direct Deposit",
              type: "deposit",
              category: 'finance',
              date: doc.data().createdAt?.toDate() || new Date()
            }));
            updateState(data, 'depo');
          });

          const unsubTrade = onSnapshot(qTrade, (snap) => {
            const data = snap.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
              title: doc.data().type === 'deposit' ? "Agent Deposit" : "Agent Withdrawal",
              category: 'finance',
              date: doc.data().createdAt?.toDate() || new Date()
            }));
            updateState(data, 'trade');
          });

          unsubscribes.push(unsubTrans, unsubDepo, unsubTrade);
        };

        // Helper to merge data from different streams
        let streamStorage = { trans: [], depo: [], trade: [] };
        const updateState = (newData, streamKey) => {
          streamStorage[streamKey] = newData;
          const combined = [...streamStorage.trans, ...streamStorage.depo, ...streamStorage.trade]
            .sort((a, b) => b.date - a.date);
          
          setTransactions(combined);
          setLoading(false);
        };

        syncData();
        return () => unsubscribes.forEach(unsub => unsub());
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  const filteredData = transactions.filter(item => {
    if (filter === "all") return true;
    if (filter === "games") return item.category === "games";
    if (filter === "finance") return item.category === "finance";
    return true;
  });

  return (
    <div className="min-h-screen bg-[#0f172a] pb-24 text-white">
      {/* Header Section */}
      <div className="bg-[#613de6] p-8 rounded-b-[3.5rem] shadow-2xl text-center border-b-4 border-[#fc7952] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
            <History size={300} className="absolute -top-20 -left-20 rotate-12" />
        </div>
        <h1 className="relative z-10 text-3xl font-black italic tracking-tighter flex items-center justify-center space-x-3 text-white">
          <History size={28} className="animate-pulse" />
          <span>HISTORY</span>
        </h1>
        <p className="relative z-10 text-white/60 text-[10px] font-black uppercase mt-2 tracking-[0.3em]">Ledger & Performance</p>
      </div>

      <div className="p-4 max-w-2xl mx-auto -mt-6">
        {/* Filters */}
        <div className="flex space-x-2 mb-8 overflow-x-auto pb-2 no-scrollbar px-2 relative z-20">
          {["all", "games", "finance"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase transition-all whitespace-nowrap border-2 ${
                filter === f 
                ? 'bg-[#fc7952] border-[#fc7952] text-white shadow-[0_10px_20px_rgba(252,121,82,0.3)]' 
                : 'bg-[#1e293b] border-white/5 text-gray-500 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Transaction List */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-20">
              <Loader2 className="w-12 h-12 text-[#613de6] animate-spin mx-auto mb-4" />
              <p className="text-gray-500 font-black uppercase text-[10px] tracking-widest">Syncing Nodes...</p>
            </div>
          ) : filteredData.map((item) => {
            const isPositive = item.type === 'deposit' || item.type === 'win';
            const dateStr = item.date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            
            return (
              <div 
                key={item.id} 
                className="bg-[#1e293b] border border-white/5 p-5 rounded-[2.5rem] flex items-center justify-between group hover:border-[#613de6]/50 transition-all duration-300 shadow-xl"
              >
                <div className="flex items-center space-x-4">
                  {/* Icon Logic */}
                  <div className={`p-4 rounded-2xl shadow-inner ${
                    isPositive ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                  }`}>
                    {item.type === 'win' ? <Trophy size={20}/> : 
                     item.type === 'stake' ? <Swords size={20}/> :
                     item.type === 'deposit' ? <ArrowDownLeft size={20}/> : <ArrowUpRight size={20}/>}
                  </div>

                  <div>
                    <h4 className="font-black text-xs text-white uppercase tracking-tight">
                      {item.title || (item.type === 'win' ? 'Round Victory' : 'Game Stake')}
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[9px] text-gray-500 font-bold uppercase">{dateStr}</p>
                        {item.status && (
                            <div className={`flex items-center gap-1 text-[8px] font-black uppercase px-2 py-0.5 rounded-md ${
                                item.status === 'completed' ? 'bg-green-500/20 text-green-400' : 
                                item.status === 'pending' ? 'bg-orange-500/20 text-orange-400' : 'bg-red-500/20 text-red-400'
                            }`}>
                                {item.status === 'completed' ? <CheckCircle2 size={10}/> : item.status === 'pending' ? <Clock size={10}/> : <XCircle size={10}/>}
                                {item.status}
                            </div>
                        )}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <p className={`font-black text-xl italic tracking-tighter ${
                    isPositive ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {isPositive ? '+' : '-'}${Math.abs(parseFloat(item.amount || 0)).toFixed(2)}
                  </p>
                  <span className="text-[8px] font-black uppercase opacity-30 tracking-widest">
                    {item.type || 'Transfer'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {!loading && filteredData.length === 0 && (
          <div className="text-center py-24 bg-[#1e293b] rounded-[3rem] border border-dashed border-white/5 opacity-50">
            <Coins size={48} className="mx-auto mb-4 text-gray-700" />
            <p className="font-black uppercase text-[10px] tracking-[0.2em] text-gray-500">No History found in {filter}</p>
          </div>
        )}
      </div>
    </div>
  );
}