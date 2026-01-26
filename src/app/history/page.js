"use client";
import { useState, useEffect } from "react";
import { ArrowDownLeft, ArrowUpRight, Swords, History, Filter, Trophy, Coins } from "lucide-react";
// FIREBASE IMPORTS
import { auth, db } from "@/lib/firebase";
import { collection, query, onSnapshot, orderBy } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

export default function HistoryPage() {
  const [filter, setFilter] = useState("all");
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Path: users/{uid}/transactions
        const transRef = collection(db, "users", user.uid, "transactions");
        // Ensure you have a Firestore Index created for this query
        const q = query(transRef, orderBy("timestamp", "desc"));

        const unsubscribeSnap = onSnapshot(q, (snapshot) => {
          const transData = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              // Safety check for date formatting
              dateStr: data.timestamp?.toDate ? data.timestamp.toDate().toLocaleString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit' 
              }) : "Processing..."
            };
          });
          setTransactions(transData);
          setLoading(false);
        });

        return () => unsubscribeSnap();
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  const filteredData = transactions.filter(item => {
    if (filter === "all") return true;
    if (filter === "games") return item.type === "game" || item.type === "win" || item.type === "stake";
    if (filter === "finance") return item.type === "deposit" || item.type === "withdrawal";
    return true;
  });

  return (
    <div className="min-h-screen bg-[#0f172a] pb-24 text-white">
      {/* Header Section */}
      <div className="bg-[#613de6] p-8 rounded-b-[3rem] shadow-2xl text-center border-b-4 border-[#fc7952]">
        <h1 className="text-3xl font-black italic tracking-tighter flex items-center justify-center space-x-3 text-white">
          <History size={28} className="animate-pulse" />
          <span>TRANSACTION HISTORY</span>
        </h1>
        <p className="text-white/60 text-[10px] font-black uppercase mt-2 tracking-[0.3em]">Transaction & Battle History</p>
      </div>

      <div className="p-4 max-w-2xl mx-auto -mt-6">
        {/* Filters */}
        <div className="flex space-x-2 mb-8 overflow-x-auto pb-2 no-scrollbar px-2">
          {["all", "games", "finance"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase transition-all whitespace-nowrap border-2 ${
                filter === f 
                ? 'bg-[#fc7952] border-[#fc7952] text-white shadow-[0_10px_20px_rgba(252,121,82,0.3)]' 
                : 'bg-[#1e293b] border-white/5 text-gray-500'
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
              <div className="w-12 h-12 border-4 border-[#613de6] border-t-[#fc7952] rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-500 font-black uppercase text-[10px] tracking-widest">Fetching Ledgers...</p>
            </div>
          ) : filteredData.map((item) => {
            const isPositive = item.type === 'deposit' || item.type === 'win';
            
            return (
              <div 
                key={item.id} 
                className="bg-[#1e293b] border border-white/5 p-5 rounded-[2rem] flex items-center justify-between group hover:border-[#613de6]/50 transition-all duration-300 shadow-lg"
              >
                <div className="flex items-center space-x-4">
                  {/* Icon Logic */}
                  <div className={`p-4 rounded-2xl shadow-inner ${
                    isPositive 
                    ? 'bg-green-500/10 text-green-500' 
                    : 'bg-red-500/10 text-red-500'
                  }`}>
                    {item.type === 'win' ? <Trophy size={22}/> : 
                     item.type === 'stake' ? <Swords size={22}/> :
                     item.type === 'deposit' ? <ArrowDownLeft size={22}/> : <ArrowUpRight size={22}/>}
                  </div>

                  <div>
                    <h4 className="font-black text-xs text-white uppercase tracking-tight">
                      {item.title || (item.type === 'win' ? 'Round Victory' : 'Game Stake')}
                    </h4>
                    <p className="text-[10px] text-gray-500 font-bold mt-0.5">
                      {item.dateStr}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <p className={`font-black text-xl italic tracking-tighter ${
                    isPositive ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {isPositive ? '+' : '-'}${Math.abs(parseFloat(item.amount || 0)).toFixed(2)}
                  </p>
                  <span className={`text-[8px] font-black uppercase px-3 py-1 rounded-full ${
                    isPositive ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                  }`}>
                    {item.type}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {!loading && filteredData.length === 0 && (
          <div className="text-center py-24 bg-[#1e293b] rounded-[3rem] border border-dashed border-white/5">
            <Coins size={48} className="mx-auto mb-4 text-gray-700" />
            <p className="font-black uppercase text-[10px] tracking-[0.2em] text-gray-500">No Transactions Recorded</p>
          </div>
        )}
      </div>
    </div>
  );
}