"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  Search, 
  Download,
  Calendar
} from "lucide-react";

export default function AgentTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetching all trades handled by agents
    const q = query(collection(db, "trades"), orderBy("timestamp", "desc"));
    
    const unsub = onSnapshot(q, (snap) => {
      const txs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Filter to show only completed trades handled by agents
      setTransactions(txs.filter(t => t.agentId && t.status === "completed"));
      setLoading(false);
    });

    return () => unsub();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black italic uppercase text-slate-800">Agent Ledger</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Full history of merchant settlements</p>
        </div>
        <button className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-xs font-black uppercase text-slate-600 hover:bg-slate-50 transition-all">
          <Download size={16} /> Export CSV
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400">Transaction</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400">Agent</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400">User</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400">Amount</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {transactions.map((tx) => (
              <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="p-6">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${tx.type === 'deposit' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                      {tx.type === 'deposit' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-tighter">{tx.type}</p>
                      <p className="text-[10px] text-slate-400 font-mono">#{tx.id.slice(0, 8)}</p>
                    </div>
                  </div>
                </td>
                <td className="p-6">
                  <p className="text-sm font-black italic text-[#613de6]">{tx.agentName || "Agent"}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{tx.agentId?.slice(0,10)}...</p>
                </td>
                <td className="p-6">
                  <p className="text-sm font-bold text-slate-700">{tx.username || "User"}</p>
                </td>
                <td className="p-6">
                  <p className="text-lg font-black italic text-slate-900">${tx.amount}</p>
                </td>
                <td className="p-6">
                  <span className="px-3 py-1 bg-green-100 text-green-600 rounded-full text-[9px] font-black uppercase tracking-widest">
                    Settled
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}