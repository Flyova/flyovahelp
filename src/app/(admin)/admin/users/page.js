"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  query, 
  orderBy 
} from "firebase/firestore";
import { 
  Users, 
  Search, 
  ShieldCheck, 
  ShieldAlert, 
  Wallet, 
  MoreHorizontal,
  Edit2,
  Check,
  X
} from "lucide-react";

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingWallet, setEditingWallet] = useState(null); // ID of user being edited
  const [newBalance, setNewBalance] = useState("");

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("username", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const toggleUserStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === "banned" ? "active" : "banned";
    if (confirm(`Are you sure you want to set this user to ${newStatus}?`)) {
      await updateDoc(doc(db, "users", id), { status: newStatus });
    }
  };

  const handleBalanceUpdate = async (id) => {
    if (isNaN(newBalance) || newBalance === "") return alert("Enter a valid number");
    try {
      await updateDoc(doc(db, "users", id), { wallet: Number(newBalance) });
      setEditingWallet(null);
      setNewBalance("");
      alert("Wallet updated successfully");
    } catch (e) {
      alert("Error updating wallet");
    }
  };

  const filteredUsers = users.filter(u => 
    u.username?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.id.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black italic uppercase text-slate-800">User Directory</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Manage platform players and wallet balances</p>
        </div>
        <div className="bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100">
           <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Total Players</p>
           <p className="text-xl font-black italic text-indigo-600">{users.length}</p>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative">
        <Search className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input 
          type="text" 
          placeholder="Search by Username, Email, or UID..." 
          className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:border-[#613de6]"
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* USERS TABLE */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Player</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Contact Info</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Wallet Balance</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredUsers.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center font-black italic text-[#613de6] border border-slate-200">
                      {user.username?.charAt(0).toUpperCase() || "?"}
                    </div>
                    <div>
                      <p className="text-sm font-black italic uppercase text-slate-800">{user.username || "Player"}</p>
                      <p className="text-[9px] font-mono text-slate-400">{user.id}</p>
                    </div>
                  </div>
                </td>
                <td className="p-6 text-sm font-bold text-slate-500">
                  {user.email}
                </td>
                <td className="p-6">
                  <div className="flex flex-col items-center justify-center">
                    {editingWallet === user.id ? (
                      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                        <input 
                          type="number"
                          value={newBalance}
                          onChange={(e) => setNewBalance(e.target.value)}
                          className="w-20 bg-transparent text-center font-black text-sm outline-none"
                          autoFocus
                        />
                        <button onClick={() => handleBalanceUpdate(user.id)} className="p-1 text-green-500 hover:bg-white rounded-md"><Check size={14}/></button>
                        <button onClick={() => setEditingWallet(null)} className="p-1 text-rose-500 hover:bg-white rounded-md"><X size={14}/></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 group">
                        <span className="text-lg font-black italic text-emerald-600">${user.wallet?.toLocaleString() || 0}</span>
                        <button 
                          onClick={() => {
                            setEditingWallet(user.id);
                            setNewBalance(user.wallet);
                          }} 
                          className="p-1.5 bg-slate-50 text-slate-300 rounded-md opacity-0 group-hover:opacity-100 transition-all hover:text-[#613de6]"
                        >
                          <Edit2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </td>
                <td className="p-6 text-right">
                  <button 
                    onClick={() => toggleUserStatus(user.id, user.status)}
                    className={`px-4 py-2 rounded-xl font-black uppercase text-[10px] tracking-tighter transition-all ${
                      user.status === 'banned' 
                      ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white' 
                      : 'bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white'
                    }`}
                  >
                    {user.status === 'banned' ? 'Unban User' : 'Ban User'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}