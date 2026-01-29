"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { Send, Search, User, ArrowRight, Calendar } from "lucide-react";

export default function AdminTransfers() {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Assuming internal transfers are 'trades' with type 'transfer'
    const q = query(
      collection(db, "trades"), 
      where("type", "==", "transfer"),
      orderBy("timestamp", "desc")
    );
    
    const unsub = onSnapshot(q, (snap) => {
      setTransfers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => unsub();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black italic uppercase text-slate-800">Internal Transfers</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Monitor P2P movements between users</p>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400">Sender</th>
              <th className="p-6 text-center text-[10px] font-black uppercase text-slate-400">Direction</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400">Receiver</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400">Amount</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {transfers.length === 0 ? (
              <tr>
                <td colSpan="5" className="p-20 text-center text-slate-400 font-bold italic">No internal transfers recorded yet.</td>
              </tr>
            ) : (
              transfers.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-6">
                    <p className="text-sm font-black text-slate-800">{tx.senderUsername || "Sender"}</p>
                    <p className="text-[10px] font-mono text-slate-400">{tx.senderId?.slice(0,8)}</p>
                  </td>
                  <td className="p-6 text-center">
                    <div className="inline-flex p-2 bg-indigo-50 text-indigo-600 rounded-full">
                      <ArrowRight size={16} />
                    </div>
                  </td>
                  <td className="p-6">
                    <p className="text-sm font-black text-slate-800">{tx.receiverUsername || "Receiver"}</p>
                    <p className="text-[10px] font-mono text-slate-400">{tx.receiverId?.slice(0,8)}</p>
                  </td>
                  <td className="p-6">
                    <p className="text-lg font-black italic text-indigo-600">${tx.amount}</p>
                  </td>
                  <td className="p-6">
                    <p className="text-[10px] font-black text-slate-400 uppercase">
                      {tx.timestamp?.toDate().toLocaleDateString()}
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