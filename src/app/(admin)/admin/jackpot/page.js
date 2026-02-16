"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { 
  collection, 
  query, 
  getDocs, 
  addDoc, 
  serverTimestamp, 
  where,
  limit
} from "firebase/firestore";
import { Search, Trophy, Send, User, Loader2, CheckCircle2 } from "lucide-react";

export default function AdminJackpot() {
  const [searchTerm, setSearchTerm] = useState("");
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [success, setSuccess] = useState(false);

  // Search users by Email or ID
  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    setSearching(true);
    try {
      const q = query(
        collection(db, "users"), 
        where("email", ">=", searchTerm),
        where("email", "<=", searchTerm + "\uf8ff"),
        limit(5)
      );
      const snap = await getDocs(q);
      const results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(results);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const sendJackpot = async () => {
    if (!selectedUser || !amount || loading) return;
    setLoading(true);
    
    try {
      await addDoc(collection(db, "jackpots"), {
        userId: selectedUser.id,
        userEmail: selectedUser.email,
        amount: Number(amount),
        status: "pending", // pending, claimed
        createdAt: serverTimestamp(),
        type: "ADMIN_GIFT"
      });

      setSuccess(true);
      setAmount("");
      setSelectedUser(null);
      setSearchTerm("");
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      alert("Failed to dispatch jackpot");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-4 bg-amber-100 text-amber-600 rounded-3xl">
          <Trophy size={32} />
        </div>
        <div>
          <h1 className="text-3xl font-black uppercase italic tracking-tighter text-slate-800">Jackpot Dispatch</h1>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Reward loyal players with instant bonuses</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Step 1: Find User */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
          <h3 className="text-sm font-black text-blue-600 uppercase mb-6 flex items-center gap-2">
            <User size={16} className="text-blue-600" /> 1. Select Recipient
          </h3>
          
          <div className="flex gap-2 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search user email..."
                className="w-full bg-slate-50 border text-black border-slate-100 rounded-2xl py-3 pl-10 pr-4 text-sm outline-none focus:border-blue-500 transition-all"
              />
            </div>
            <button 
              onClick={handleSearch}
              disabled={searching}
              className="bg-slate-800 text-white px-6 rounded-2xl font-bold text-xs uppercase hover:bg-black transition-all"
            >
              {searching ? <Loader2 className="animate-spin" size={16} /> : "Find"}
            </button>
          </div>

          <div className="space-y-2">
            {users.map(u => (
              <div 
                key={u.id}
                onClick={() => setSelectedUser(u)}
                className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                  selectedUser?.id === u.id ? 'border-blue-500 bg-blue-50' : 'border-slate-100 hover:bg-slate-50'
                }`}
              >
                <div>
                  <p className="text-xs font-black text-slate-700">{u.email}</p>
                  <p className="text-[10px] text-slate-400">UID: {u.id.slice(0,8)}...</p>
                </div>
                {selectedUser?.id === u.id && <CheckCircle2 size={18} className="text-blue-600" />}
              </div>
            ))}
          </div>
        </div>

        {/* Step 2: Amount & Send */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden">
          {success && (
            <div className="absolute inset-0 bg-emerald-500 flex flex-col items-center justify-center text-white z-20 animate-in fade-in duration-300">
              <CheckCircle2 size={48} className="mb-2" />
              <p className="font-black uppercase tracking-widest italic">Jackpot Dispatched!</p>
            </div>
          )}

          <h3 className="text-sm font-black uppercase mb-6 text-blue-600 flex items-center gap-2">
            <Send size={16} className="text-amber-600" /> 2. Set Amount
          </h3>

          <div className="space-y-6">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 ml-2">Amount (USD)</label>
              <div className="relative mt-1">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400">$</span>
                <input 
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-slate-50 border border-slate-100 rounded-3xl py-6 pl-10 pr-4 text-3xl font-black text-slate-800 outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <button 
              onClick={sendJackpot}
              disabled={!selectedUser || !amount || loading}
              className="w-full bg-amber-500 hover:bg-amber-600 py-6 rounded-[2rem] text-white font-black uppercase tracking-widest shadow-xl shadow-amber-200 transition-all active:scale-95 disabled:opacity-30 disabled:grayscale"
            >
              {loading ? <Loader2 className="animate-spin mx-auto" size={24} /> : "Dispatch Jackpot"}
            </button>

            {selectedUser && (
              <p className="text-center text-[10px] font-bold text-slate-400 uppercase italic">
                Sending to: <span className="text-slate-600">{selectedUser.email}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}