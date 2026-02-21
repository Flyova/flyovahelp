"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { 
  collection, onSnapshot, doc, query, where, getDocs, orderBy 
} from "firebase/firestore";
import { 
  Users, Search, Wallet, Edit2, X, User, Mail, Phone, 
  Globe, Loader2, Save, Calendar, ShieldCheck 
} from "lucide-react";

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  
  const [selectedUser, setSelectedUser] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("username", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setUsers(docs);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const openEditModal = (user) => {
    setSelectedUser(user);
    setEditForm({
      uid: user.id,
      username: user.username || "",
      fullName: user.fullName || "",
      email: user.email || "",
      phone: user.phone || "",
      dob: user.dob || "",
      country: user.country || "",
      wallet: user.wallet || 0,
      role: user.role || "user",
      status: user.status || "active"
    });
    setIsModalOpen(true);
  };

  const handleUpdateUser = async () => {
    setIsUpdating(true);
    try {
      // 1. DUPLICATE USERNAME CHECK
      if (editForm.username !== selectedUser.username) {
        const q = query(collection(db, "users"), where("username", "==", editForm.username));
        const checkSnap = await getDocs(q);
        if (!checkSnap.empty) {
          alert("Error: This username is already taken by another merchant.");
          setIsUpdating(false);
          return;
        }
      }

      // 2. SYNCED UPDATE (AUTH + FIRESTORE)
      const res = await fetch("/api/admin/update-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm)
      });

      const result = await res.json();

      if (res.ok) {
        alert("Account records synchronized successfully!");
        setIsModalOpen(false);
      } else {
        throw new Error(result.error || "Update failed");
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const filteredUsers = users.filter(u => 
    u.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-black italic">LOADING DIRECTORY...</div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-[#613de6]/10 text-[#613de6] rounded-3xl"><Users size={32} /></div>
            <div>
              <h1 className="text-3xl font-black uppercase italic tracking-tighter">Merchants</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Total Users: {users.length}</p>
            </div>
          </div>
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
            <input 
              placeholder="SEARCH USERNAME..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 pl-12 pr-6 py-4 rounded-2xl text-[10px] font-black uppercase outline-none focus:border-[#613de6]"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50">
              <tr>
                <th className="p-6 text-[10px] font-black uppercase text-slate-400">Merchant</th>
                <th className="p-6 text-[10px] font-black uppercase text-slate-400">Wallet</th>
                <th className="p-6 text-[10px] font-black uppercase text-slate-400">Country</th>
                <th className="p-6 text-right text-[10px] font-black uppercase text-slate-400">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/30 transition-colors">
                  <td className="p-6 flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black italic">{u.username?.charAt(0)}</div>
                    <div>
                      <p className="text-sm font-black uppercase italic">{u.username}</p>
                      <p className="text-[10px] font-bold text-slate-400">{u.email}</p>
                    </div>
                  </td>
                  <td className="p-6 font-black text-emerald-600">${u.wallet?.toFixed(2)}</td>
                  <td className="p-6 text-[10px] font-bold uppercase text-slate-400">{u.country || "N/A"}</td>
                  <td className="p-6 text-right">
                    <button onClick={() => openEditModal(u)} className="p-3 bg-slate-100 rounded-xl hover:bg-[#613de6] hover:text-white transition-all"><Edit2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Modal with ALL Fields restored */}
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                    <h2 className="text-2xl font-black uppercase italic tracking-tighter">Edit Profile</h2>
                    <button onClick={() => setIsModalOpen(false)} className="p-3 text-slate-400 hover:text-red-500"><X size={20} /></button>
                </div>

                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[60vh] overflow-y-auto">
                    {/* Basic Info */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400">Username (Unique)</label>
                        <input value={editForm.username} onChange={(e)=>setEditForm({...editForm, username: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold outline-none focus:border-[#613de6]" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400">Full Name</label>
                        <input value={editForm.fullName} onChange={(e)=>setEditForm({...editForm, fullName: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold outline-none focus:border-[#613de6]" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400">Email (Auth Sync)</label>
                        <input value={editForm.email} onChange={(e)=>setEditForm({...editForm, email: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold outline-none focus:border-[#613de6]" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400">Phone</label>
                        <input value={editForm.phone} onChange={(e)=>setEditForm({...editForm, phone: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold outline-none focus:border-[#613de6]" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400">DOB</label>
                        <input type="date" value={editForm.dob} onChange={(e)=>setEditForm({...editForm, dob: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold outline-none focus:border-[#613de6]" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400">Country</label>
                        <input value={editForm.country} onChange={(e)=>setEditForm({...editForm, country: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold outline-none focus:border-[#613de6]" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400">Wallet Balance</label>
                        <input type="number" value={editForm.wallet} onChange={(e)=>setEditForm({...editForm, wallet: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-black text-emerald-600 outline-none focus:border-[#613de6]" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400">Account Status</label>
                        <select value={editForm.status} onChange={(e)=>setEditForm({...editForm, status: e.target.value})} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold outline-none cursor-pointer">
                            <option value="active">ACTIVE</option>
                            <option value="banned">BANNED</option>
                        </select>
                    </div>
                </div>

                <div className="p-8 border-t border-slate-100">
                    <button 
                        onClick={handleUpdateUser} 
                        disabled={isUpdating}
                        className="w-full bg-[#613de6] text-white py-5 rounded-[2rem] font-black italic uppercase text-sm shadow-xl flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 transition-all"
                    >
                        {isUpdating ? <Loader2 className="animate-spin" /> : <><Save size={20} /> Sync Profile & Login</>}
                    </button>
                </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}