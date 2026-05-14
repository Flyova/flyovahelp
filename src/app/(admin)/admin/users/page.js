"use client";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, doc, getDocs, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";
import { Activity, Ban, CheckCircle, Edit2, Gift, Loader2, Save, Search, Users, X } from "lucide-react";
import Link from "next/link";

const formatJoinedDate = (timestamp) => {
  if (!timestamp?.toDate) return "N/A";
  return timestamp.toDate().toLocaleDateString();
};

const normalizePin = (value) => String(value || "").replace(/\D/g, "").slice(0, 8);

const getWelcomeBonusMeta = (user) => {
  const status = user.welcomeBonusStatus;
  const claimed = Boolean(
    user.welcomeBonusClaimed === true ||
    user.welcomeBonusPaid === true ||
    user.bonusClaimed === true ||
    user.bonusDeducted === true ||
    status === "recovered"
  );

  if (!claimed) {
    return { claimed: false, paid: false, label: "Not Claimed", tone: "bg-slate-100 text-slate-500" };
  }

  const paid =
    typeof user.welcomeBonusPaid === "boolean"
      ? user.welcomeBonusPaid
      : Boolean(user.bonusClaimed || user.bonusDeducted);

  if (!paid) {
    return { claimed: true, paid: false, label: "Not Paid", tone: "bg-rose-100 text-rose-600" };
  }

  const recovered = status === "recovered" || user.bonusDeducted === true;
  if (recovered) {
    return { claimed: true, paid: true, label: "Paid (Recovered)", tone: "bg-amber-100 text-amber-700" };
  }

  return { claimed: true, paid: true, label: "Paid", tone: "bg-emerald-100 text-emerald-700" };
};

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
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
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
      pin: user.pin || "",
      createdAt: user.createdAt || null,
      referredBy: user.referredBy || "",
      referrerUid: user.referrerUid || "",
      wallet: user.wallet || 0,
      role: user.role || "user",
      status: user.status || "active",
      isban: user.isban || false,
    });
    setIsModalOpen(true);
  };

  const handleToggleBan = async (user) => {
    const newBanStatus = !user.isban;
    if (!window.confirm(`Are you sure you want to ${newBanStatus ? "BAN" : "UNBAN"} ${user.username}?`)) return;

    try {
      await updateDoc(doc(db, "users", user.id), {
        isban: newBanStatus,
        status: newBanStatus ? "banned" : "active",
      });
    } catch (err) {
      alert("Failed to update ban status: " + err.message);
    }
  };

  const handleUpdateUser = async () => {
    const trimmedUsername = String(editForm.username || "").trim();
    const normalizedPin = normalizePin(editForm.pin);
    const pinConflictUser = users.find(
      (u) => u.id !== selectedUser?.id && normalizePin(u.pin) === normalizedPin
    );

    if (!trimmedUsername) {
      alert("Username is required.");
      return;
    }
    if (normalizedPin.length !== 8) {
      alert("Account PIN must be exactly 8 digits.");
      return;
    }
    if (pinConflictUser) {
      alert(`Account PIN ${normalizedPin} is already used by ${pinConflictUser.username || pinConflictUser.email || "another user"}.`);
      return;
    }

    setIsUpdating(true);
    try {
      if (trimmedUsername !== selectedUser.username) {
        const q = query(collection(db, "users"), where("username", "==", trimmedUsername));
        const checkSnap = await getDocs(q);
        const usernameConflict = checkSnap.docs.some((d) => d.id !== selectedUser?.id);
        if (usernameConflict) {
          alert("Error: This username is already taken by another merchant.");
          setIsUpdating(false);
          return;
        }
      }

      const res = await fetch("/api/admin/update-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          username: trimmedUsername,
          pin: normalizedPin,
        }),
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

  const search = searchTerm.toLowerCase().trim();

  const filteredUsers = useMemo(
    () =>
      users.filter((u) => {
        if (!search) return true;
        return (
          u.username?.toLowerCase().includes(search) ||
          u.email?.toLowerCase().includes(search) ||
          u.country?.toLowerCase().includes(search) ||
          u.pin?.toLowerCase().includes(search)
        );
      }),
    [users, search]
  );

  const bonusClaimants = useMemo(
    () => users.filter((u) => getWelcomeBonusMeta(u).claimed),
    [users]
  );

  const filteredClaimants = useMemo(
    () =>
      bonusClaimants.filter((u) => {
        if (!search) return true;
        return (
          u.username?.toLowerCase().includes(search) ||
          u.email?.toLowerCase().includes(search) ||
          u.country?.toLowerCase().includes(search) ||
          u.pin?.toLowerCase().includes(search)
        );
      }),
    [bonusClaimants, search]
  );

  const paidBonusCount = useMemo(
    () => bonusClaimants.filter((u) => getWelcomeBonusMeta(u).paid).length,
    [bonusClaimants]
  );
  const unpaidBonusCount = bonusClaimants.length - paidBonusCount;
  const normalizedEditingPin = normalizePin(editForm.pin);
  const pinConflictUser = useMemo(
    () =>
      users.find(
        (u) => u.id !== selectedUser?.id && normalizePin(u.pin) === normalizedEditingPin
      ),
    [users, selectedUser?.id, normalizedEditingPin]
  );
  const isPinValid = normalizedEditingPin.length === 8;
  const canSaveProfile = !isUpdating && isPinValid && !pinConflictUser;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-black italic">
        LOADING DIRECTORY...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-[#613de6]/10 text-[#613de6] rounded-3xl">
              <Users size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-black uppercase italic tracking-tighter">Merchants</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                Total Users: {users.length}
              </p>
            </div>
          </div>
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
            <input
              placeholder="SEARCH USERNAME / EMAIL / COUNTRY / PIN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 pl-12 pr-6 py-4 rounded-2xl text-[10px] font-black uppercase outline-none focus:border-[#613de6]"
            />
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left">
              <thead className="bg-slate-50/50">
                <tr>
                  <th className="p-6 text-[10px] font-black uppercase text-slate-400">Merchant</th>
                  <th className="p-6 text-[10px] font-black uppercase text-slate-400">Wallet</th>
                  <th className="p-6 text-[10px] font-black uppercase text-slate-400">PIN</th>
                  <th className="p-6 text-[10px] font-black uppercase text-slate-400">Country</th>
                  <th className="p-6 text-[10px] font-black uppercase text-slate-400">Welcome Bonus</th>
                  <th className="p-6 text-[10px] font-black uppercase text-slate-400">Joined</th>
                  <th className="p-6 text-right text-[10px] font-black uppercase text-slate-400">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredUsers.map((u) => {
                  const bonusMeta = getWelcomeBonusMeta(u);
                  return (
                    <tr key={u.id} className={`hover:bg-slate-50/30 transition-colors ${u.isban ? "bg-red-50/50" : ""}`}>
                      <td className="p-6 flex items-center gap-4">
                        <div className={`w-10 h-10 ${u.isban ? "bg-red-500" : "bg-slate-900"} text-white rounded-xl flex items-center justify-center font-black italic`}>
                          {u.username?.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-black uppercase italic flex items-center gap-2">
                            {u.username}
                            {u.isban && (
                              <span className="text-[8px] bg-red-500 text-white px-2 py-0.5 rounded-full not-italic">
                                BANNED
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] font-bold text-slate-400">{u.email}</p>
                        </div>
                      </td>
                      <td className="p-6 font-black text-emerald-600">${Number(u.wallet || 0).toFixed(2)}</td>
                      <td className="p-6 text-[10px] font-mono font-black text-indigo-600">{u.pin || "--------"}</td>
                      <td className="p-6 text-[10px] font-bold uppercase text-slate-400">{u.country || "N/A"}</td>
                      <td className="p-6">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${bonusMeta.tone}`}>
                          {bonusMeta.label}
                        </span>
                      </td>
                      <td className="p-6 text-[10px] font-bold uppercase text-slate-400">
                        {formatJoinedDate(u.createdAt)}
                      </td>
                      <td className="p-6 text-right whitespace-nowrap space-x-2">
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="px-4 py-3 rounded-xl transition-all font-black uppercase text-[10px] inline-flex items-center gap-2 bg-indigo-100 text-indigo-600 hover:bg-indigo-600 hover:text-white"
                        >
                          <Activity size={14} /> Activity
                        </Link>
                        <button
                          onClick={() => handleToggleBan(u)}
                          className={`px-4 py-3 rounded-xl transition-all font-black uppercase text-[10px] inline-flex items-center gap-2 ${u.isban ? "bg-emerald-100 text-emerald-600 hover:bg-emerald-600 hover:text-white" : "bg-red-100 text-red-600 hover:bg-red-600 hover:text-white"}`}
                        >
                          {u.isban ? (
                            <>
                              <CheckCircle size={14} /> Unban
                            </>
                          ) : (
                            <>
                              <Ban size={14} /> Ban
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => openEditModal(u)}
                          className="p-3 bg-slate-100 rounded-xl hover:bg-[#613de6] hover:text-white transition-all"
                        >
                          <Edit2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-700">
                <Gift size={20} />
              </div>
              <div>
                <h2 className="text-xl font-black uppercase italic tracking-tight">Welcome Bonus Claims ($3)</h2>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Users that claimed signup bonus + payout status
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
              <span className="px-3 py-2 rounded-full bg-slate-100 text-slate-500">Claimed: {bonusClaimants.length}</span>
              <span className="px-3 py-2 rounded-full bg-emerald-100 text-emerald-700">Paid: {paidBonusCount}</span>
              <span className="px-3 py-2 rounded-full bg-rose-100 text-rose-600">Not Paid: {unpaidBonusCount}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-slate-50/50">
                <tr>
                  <th className="p-6 text-[10px] font-black uppercase text-slate-400">Merchant</th>
                  <th className="p-6 text-[10px] font-black uppercase text-slate-400">Email</th>
                  <th className="p-6 text-[10px] font-black uppercase text-slate-400">PIN</th>
                  <th className="p-6 text-[10px] font-black uppercase text-slate-400">Status</th>
                  <th className="p-6 text-[10px] font-black uppercase text-slate-400">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredClaimants.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-[11px] font-black uppercase tracking-widest text-slate-400">
                      No bonus claimers found.
                    </td>
                  </tr>
                ) : (
                  filteredClaimants.map((u) => {
                    const bonusMeta = getWelcomeBonusMeta(u);
                    return (
                      <tr key={`bonus-${u.id}`} className="hover:bg-slate-50/30 transition-colors">
                        <td className="p-6 text-sm font-black uppercase italic text-slate-800">{u.fullName || u.username || "User"}</td>
                        <td className="p-6 text-[10px] font-bold text-slate-500">{u.email || "No email"}</td>
                        <td className="p-6 text-[10px] font-mono font-black text-indigo-600">{u.pin || "--------"}</td>
                        <td className="p-6">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${bonusMeta.tone}`}>
                            {bonusMeta.paid ? "Paid" : "Not Paid"}
                          </span>
                        </td>
                        <td className="p-6 text-[10px] font-bold uppercase text-slate-400">{formatJoinedDate(u.createdAt)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100">
              <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                <h2 className="text-2xl font-black uppercase italic tracking-tighter">Edit Profile</h2>
                <button onClick={() => setIsModalOpen(false)} className="p-3 text-slate-400 hover:text-red-500">
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[60vh] overflow-y-auto">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">Username (Unique)</label>
                  <input value={editForm.username} onChange={(e) => setEditForm({ ...editForm, username: e.target.value })} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold outline-none focus:border-[#613de6]" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">Full Name</label>
                  <input value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold outline-none focus:border-[#613de6]" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">Email (Auth Sync)</label>
                  <input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold outline-none focus:border-[#613de6]" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">Phone</label>
                  <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold outline-none focus:border-[#613de6]" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">DOB</label>
                  <input type="date" value={editForm.dob} onChange={(e) => setEditForm({ ...editForm, dob: e.target.value })} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold outline-none focus:border-[#613de6]" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">Country</label>
                  <input value={editForm.country} onChange={(e) => setEditForm({ ...editForm, country: e.target.value })} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-bold outline-none focus:border-[#613de6]" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">Account PIN</label>
                  <input
                    value={editForm.pin}
                    onChange={(e) => setEditForm({ ...editForm, pin: normalizePin(e.target.value) })}
                    className={`w-full bg-slate-50 border p-4 rounded-2xl text-sm font-bold outline-none focus:border-[#613de6] ${
                      pinConflictUser || (editForm.pin && !isPinValid) ? "border-rose-300" : "border-slate-100"
                    }`}
                  />
                  {pinConflictUser ? (
                    <p className="text-[10px] font-black uppercase text-rose-600">
                      PIN already used by {pinConflictUser.username || pinConflictUser.email || "another user"}.
                    </p>
                  ) : (
                    <p className={`text-[10px] font-black uppercase ${isPinValid ? "text-emerald-600" : "text-slate-400"}`}>
                      {isPinValid ? "PIN available." : "PIN must be 8 digits."}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">Wallet Balance</label>
                  <input type="number" value={editForm.wallet} onChange={(e) => setEditForm({ ...editForm, wallet: e.target.value })} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-sm font-black text-emerald-600 outline-none focus:border-[#613de6]" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">Ban Status</label>
                  <button
                    onClick={() => setEditForm({ ...editForm, isban: !editForm.isban, status: !editForm.isban ? "banned" : "active" })}
                    className={`w-full p-4 rounded-2xl text-[10px] font-black uppercase border transition-all flex items-center justify-center gap-2 ${editForm.isban ? "bg-red-50 border-red-200 text-red-600" : "bg-emerald-50 border-emerald-200 text-emerald-600"}`}
                  >
                    {editForm.isban ? (
                      <>
                        <Ban size={14} /> BANNED
                      </>
                    ) : (
                      <>
                        <CheckCircle size={14} /> ACTIVE
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="p-8 border-t border-slate-100">
                <button
                  onClick={handleUpdateUser}
                  disabled={!canSaveProfile}
                  className="w-full bg-[#613de6] text-white py-5 rounded-[2rem] font-black italic uppercase text-sm shadow-xl flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 transition-all"
                >
                  {isUpdating ? <Loader2 className="animate-spin" /> : (
                    <>
                      <Save size={20} /> Sync Profile & Login
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
