"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  query, 
  orderBy,
  limit 
} from "firebase/firestore";
import { 
  Users, 
  Search, 
  ShieldCheck, 
  ShieldAlert, 
  Wallet, 
  Edit2,
  Check,
  X,
  Eye,
  User,
  Mail,
  Phone,
  Globe,
  Loader2,
  Save,
  History,
  ArrowUpRight,
  ArrowDownLeft,
  Gamepad2
} from "lucide-react";

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingWallet, setEditingWallet] = useState(null); 
  const [newBalance, setNewBalance] = useState("");
  
  // Detail Modal States
  const [selectedUser, setSelectedUser] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editForm, setEditForm] = useState({});

  // Activity Modal States
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [userActivities, setUserActivities] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("username", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const openDetails = (user) => {
    setSelectedUser(user);
    setEditForm({ ...user });
    setIsModalOpen(true);
  };

  const openActivity = (user) => {
    setSelectedUser(user);
    setIsActivityOpen(true);
    setActivityLoading(true);
    
    // Fetch user transactions sub-collection
    const activityQ = query(
        collection(db, "users", user.id, "transactions"),
        orderBy("timestamp", "desc"),
        limit(50)
    );

    const unsubActivity = onSnapshot(activityQ, (snap) => {
        setUserActivities(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setActivityLoading(false);
    });

    return () => unsubActivity();
  };

  const handleUpdateUser = async () => {
    setIsUpdating(true);
    try {
      const userRef = doc(db, "users", selectedUser.id);
      await updateDoc(userRef, {
        fullName: editForm.fullName || "",
        username: editForm.username || "",
        email: editForm.email || "",
        phone: editForm.phone || "",
        country: editForm.country || "",
        wallet: Number(editForm.wallet) || 0,
        status: editForm.status || "active"
      });
      setIsModalOpen(false);
      alert("User updated successfully");
    } catch (e) {
      alert("Error updating user details");
    } finally {
      setIsUpdating(false);
    }
  };

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
    } catch (e) {
      alert("Error updating wallet");
    }
  };

  const filteredUsers = users.filter(u => 
    u.username?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.id.includes(searchTerm)
  );

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black italic uppercase text-slate-800 flex items-center gap-2">
            <Users className="text-[#613de6]" /> User Directory
          </h1>
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
          placeholder="Search by Name, Username, Email, or UID..." 
          className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:border-[#613de6] font-bold"
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* USERS TABLE */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Player</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Wallet Balance</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Status</th>
              <th className="p-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredUsers.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="p-6">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black italic border ${user.status === 'banned' ? 'bg-rose-50 border-rose-100 text-rose-500' : 'bg-slate-100 border-slate-200 text-[#613de6]'}`}>
                      {user.username?.charAt(0).toUpperCase() || "?"}
                    </div>
                    <div>
                      <p className="text-sm font-black italic uppercase text-slate-800 leading-tight">
                        {user.fullName || user.username || "Unknown Player"}
                      </p>
                      <p className="text-[9px] font-mono text-slate-400 uppercase tracking-tighter">UID: {user.id}</p>
                    </div>
                  </div>
                </td>
                
                <td className="p-6 text-center">
                    {editingWallet === user.id ? (
                      <div className="flex items-center justify-center gap-1 bg-slate-100 p-1 rounded-lg w-fit mx-auto">
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
                      <div className="flex items-center justify-center gap-2 group">
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
                </td>

                <td className="p-6 text-center">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${user.status === 'banned' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                        {user.status || 'active'}
                    </span>
                </td>

                <td className="p-6 text-right space-x-2">
                  <button 
                    onClick={() => openActivity(user)}
                    className="p-2.5 bg-slate-100 text-slate-400 rounded-xl hover:bg-indigo-600 hover:text-white transition-all"
                    title="View Activities"
                  >
                    <History size={16} />
                  </button>
                  <button 
                    onClick={() => openDetails(user)}
                    className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-[#613de6] hover:text-white transition-all"
                    title="View Details"
                  >
                    <Eye size={16} />
                  </button>
                  <button 
                    onClick={() => toggleUserStatus(user.id, user.status)}
                    className={`px-4 py-2 rounded-xl font-black uppercase text-[10px] tracking-tighter transition-all ${
                      user.status === 'banned' 
                      ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white' 
                      : 'bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white'
                    }`}
                  >
                    {user.status === 'banned' ? 'Unban' : 'Ban'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ACTIVITY MODAL */}
      {isActivityOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-end bg-black/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg bg-white h-full rounded-[2.5rem] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-indigo-50/30">
                    <div>
                        <h2 className="text-xl font-black italic uppercase text-slate-800">Activity History</h2>
                        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                            Recent logs for {selectedUser?.username}
                        </p>
                    </div>
                    <button onClick={() => setIsActivityOpen(false)} className="p-3 bg-white text-slate-400 rounded-2xl hover:text-rose-500 shadow-sm transition-all">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                    {activityLoading ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-300">
                            <Loader2 className="animate-spin mb-2" />
                            <p className="text-[10px] font-black uppercase">Fetching logs...</p>
                        </div>
                    ) : userActivities.length > 0 ? (
                        userActivities.map((act) => (
                            <div key={act.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                        act.type === 'stake' ? 'bg-amber-100 text-amber-600' :
                                        act.type === 'deposit' ? 'bg-emerald-100 text-emerald-600' :
                                        act.type === 'withdrawal' ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'
                                    }`}>
                                        {act.type === 'stake' ? <Gamepad2 size={18} /> : 
                                         act.type === 'deposit' ? <ArrowDownLeft size={18} /> : 
                                         <ArrowUpRight size={18} />}
                                    </div>
                                    <div>
                                        <p className="text-xs font-black uppercase text-slate-700">{act.type} {act.method ? `(${act.method})` : ''}</p>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase">
                                            {act.timestamp?.toDate().toLocaleString() || 'Recent'}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className={`text-sm font-black italic ${act.amount < 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                                        {act.amount > 0 ? '+' : ''}{act.amount?.toLocaleString()}
                                    </p>
                                    <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md ${
                                        act.status === 'pending' ? 'bg-amber-100 text-amber-600' : 
                                        act.status === 'completed' || act.status === 'success' ? 'bg-emerald-100 text-emerald-600' : 
                                        'bg-slate-200 text-slate-500'
                                    }`}>
                                        {act.status}
                                    </span>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center opacity-20 italic">
                             <History size={40} className="mb-2" />
                             <p className="text-xs font-black uppercase">No activities found</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}

      {/* DETAILS & EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-end bg-black/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-white h-full rounded-[2.5rem] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-black italic uppercase text-slate-800">Edit Player</h2>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Real-time database sync</p>
                    </div>
                    <button onClick={() => setIsModalOpen(false)} className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-6">
                    <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Identity</label>
                        <div className="relative">
                            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                            <input 
                                type="text"
                                placeholder="Full Name"
                                value={editForm.fullName || ""}
                                onChange={(e) => setEditForm({...editForm, fullName: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-100 p-4 pl-12 rounded-2xl text-sm font-bold outline-none focus:border-[#613de6]"
                            />
                        </div>
                        <input 
                            type="text"
                            placeholder="Username"
                            value={editForm.username || ""}
                            onChange={(e) => setEditForm({...editForm, username: e.target.value})}
                            className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold outline-none focus:border-[#613de6]"
                        />
                    </div>

                    <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Contact & Region</label>
                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                            <input 
                                type="email"
                                placeholder="Email Address"
                                value={editForm.email || ""}
                                onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-100 p-4 pl-12 rounded-2xl text-sm font-bold outline-none focus:border-[#613de6]"
                            />
                        </div>
                        <div className="relative">
                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                            <input 
                                type="text"
                                placeholder="Phone Number"
                                value={editForm.phone || ""}
                                onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-100 p-4 pl-12 rounded-2xl text-sm font-bold outline-none focus:border-[#613de6]"
                            />
                        </div>
                        <div className="relative">
                            <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                            <input 
                                type="text"
                                placeholder="Country"
                                value={editForm.country || ""}
                                onChange={(e) => setEditForm({...editForm, country: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-100 p-4 pl-12 rounded-2xl text-sm font-bold outline-none focus:border-[#613de6]"
                            />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Financial Status</label>
                        <div className="relative">
                            <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                            <input 
                                type="number"
                                placeholder="Wallet Balance"
                                value={editForm.wallet || ""}
                                onChange={(e) => setEditForm({...editForm, wallet: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-100 p-4 pl-12 rounded-2xl text-sm font-black text-emerald-600 outline-none focus:border-[#613de6]"
                            />
                        </div>
                        <select 
                            value={editForm.status}
                            onChange={(e) => setEditForm({...editForm, status: e.target.value})}
                            className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold outline-none focus:border-[#613de6] appearance-none"
                        >
                            <option value="active">ACTIVE PLAYER</option>
                            <option value="banned">BANNED PLAYER</option>
                        </select>
                    </div>
                </div>

                <div className="p-8 border-t border-slate-100">
                    <button 
                        onClick={handleUpdateUser}
                        disabled={isUpdating}
                        className="w-full bg-[#613de6] text-white py-5 rounded-[2rem] font-black italic uppercase text-sm shadow-xl shadow-[#613de6]/20 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
                    >
                        {isUpdating ? <Loader2 className="animate-spin" /> : <><Save size={20} /> Save Changes</>}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}