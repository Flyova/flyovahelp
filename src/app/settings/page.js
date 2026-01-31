"use client";
import { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import { 
  doc, onSnapshot, updateDoc, collection, query, where, getDocs, deleteDoc 
} from "firebase/firestore";
import { onAuthStateChanged, updatePassword, deleteUser } from "firebase/auth";
import { 
  User, 
  Mail, 
  Lock, 
  Share2, 
  CheckCircle, 
  Copy, 
  ShieldCheck,
  AlertCircle,
  ChevronLeft,
  Calendar,
  Trash2,
  UserPen,
  Phone,
  X
} from "lucide-react";
import { useRouter } from "next/navigation";

export default function Settings() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Update States
  const [newUsername, setNewUsername] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newDob, setNewDob] = useState("");
  const [updateLoading, setUpdateLoading] = useState(false);

  // Password State
  const [newPassword, setNewPassword] = useState("");
  const [passLoading, setPassLoading] = useState(false);
  const [passMessage, setPassMessage] = useState({ type: "", msg: "" });

  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Referral State
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) return router.push("/login");
      setUser(u);
      
      const unsubUser = onSnapshot(doc(db, "users", u.uid), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setUserData(data);
          setNewUsername(data.username || "");
          setNewPhone(data.phone || "");
          setNewDob(data.dob || "");
        }
        setLoading(false);
      });
      return () => unsubUser();
    });
    return () => unsub();
  }, [router]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setUpdateLoading(true);
    setPassMessage({ type: "", msg: "" });

    try {
      const updates = {};
      
      // Handle Username Change with Duplicate Check
      if (newUsername !== userData.username) {
        const q = query(collection(db, "users"), where("username", "==", newUsername));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          throw new Error("Username already taken.");
        }
        updates.username = newUsername;
      }

      // Handle Phone and DOB changes
      if (newPhone !== userData.phone) updates.phone = newPhone;
      if (newDob !== userData.dob) updates.dob = newDob;

      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, "users", user.uid), updates);
        setPassMessage({ type: "success", msg: "Profile updated successfully!" });
      }
    } catch (err) {
      setPassMessage({ type: "error", msg: err.message });
    }
    setUpdateLoading(false);
    setTimeout(() => setPassMessage({ type: "", msg: "" }), 5000);
  };

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      return setPassMessage({ type: "error", msg: "Password too short (min 6 chars)" });
    }
    
    setPassLoading(true);
    try {
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newPassword);
        setPassMessage({ type: "success", msg: "Password updated successfully!" });
        setNewPassword("");
      }
    } catch (err) {
      if (err.code === "auth/requires-recent-login") {
        setPassMessage({ type: "error", msg: "Please logout and login again to change password." });
      } else {
        setPassMessage({ type: "error", msg: err.message });
      }
    }
    setPassLoading(false);
    setTimeout(() => setPassMessage({ type: "", msg: "" }), 5000);
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    try {
      const userToAuthDelete = auth.currentUser;
      await deleteDoc(doc(db, "users", user.uid));
      await deleteUser(userToAuthDelete);
      
      alert("Goodbye, sorry to see you go. Please reach out to support if you have any questions.");
      router.push("/login");
    } catch (err) {
      console.error(err);
      if (err.code === "auth/requires-recent-login") {
        alert("Security Rule: Please logout and login again before deleting your account.");
      } else {
        alert("Error deleting account: " + err.message);
      }
      setShowDeleteModal(false);
    }
    setDeleteLoading(false);
  };

  const copyReferral = () => {
    if (!user?.uid) return;
    const link = `https://flyovahelp.com/register?ref=${user.uid}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-white italic font-black uppercase tracking-widest">
        Loading Profile...
      </div>
    );
  }

  const hasChanges = newUsername !== userData?.username || newPhone !== userData?.phone || newDob !== userData?.dob;

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col pb-10">
      
      <div className="p-6 pt-12 flex items-center gap-4 max-w-md mx-auto w-full">
        <button onClick={() => router.back()} className="p-3 bg-[#1e293b] rounded-2xl border border-white/5 active:scale-90 transition-all">
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-xl font-black italic uppercase tracking-tighter">Account Settings</h1>
      </div>
     
      <div className="p-6 space-y-6 max-w-md mx-auto w-full">
        
        {/* Profile Card */}
        <div className="bg-[#1e293b] rounded-[2.5rem] p-6 border border-white/5 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <User size={100} />
          </div>
          
          <div className="flex items-center space-x-4 mb-6 relative z-10">
            <div className="w-16 h-16 bg-[#613de6] rounded-2xl flex items-center justify-center text-2xl font-black italic shadow-lg border-2 border-white/10">
              {userData?.username ? userData.username.charAt(0).toUpperCase() : "?"}
            </div>
            <div>
              <h2 className="text-2xl font-black italic uppercase text-[#fc7952] leading-none">
                {userData?.fullName || userData?.username || "Merchant"}
              </h2>
              <div className="flex items-center text-green-500 mt-1 gap-3">
                <div className="flex items-center">
                  <ShieldCheck size={12} className="mr-1" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Verified</span>
                </div>
                <div className="flex items-center text-white/30">
                  <Calendar size={12} className="mr-1" />
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    Joined {userData?.createdAt?.toDate().toLocaleDateString() || "Today"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleUpdateProfile} className="space-y-4 relative z-10">
            {/* Username Field */}
            <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
              <p className="text-[9px] font-black uppercase text-white/40 mb-2">Unique Username</p>
              <div className="flex items-center gap-2">
                <UserPen size={16} className="text-[#613de6]" />
                <input 
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="flex-1 bg-transparent font-bold text-sm outline-none text-white placeholder:text-white/20"
                />
              </div>
            </div>

            {/* Phone Number Field */}
            <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
              <p className="text-[9px] font-black uppercase text-white/40 mb-2">Phone Number</p>
              <div className="flex items-center gap-2">
                <Phone size={16} className="text-[#613de6]" />
                <input 
                  value={newPhone}
                  placeholder="e.g. +44 7700 900000"
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="flex-1 bg-transparent font-bold text-sm outline-none text-white placeholder:text-white/20"
                />
              </div>
            </div>

            {/* Date of Birth Field */}
            <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
              <p className="text-[9px] font-black uppercase text-white/40 mb-2">Date of Birth</p>
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-[#613de6]" />
                <input 
                  type="date"
                  value={newDob}
                  onChange={(e) => setNewDob(e.target.value)}
                  className="flex-1 bg-transparent font-bold text-sm outline-none text-white invert-[0.8] brightness-200"
                />
              </div>
            </div>

            {hasChanges && (
               <button type="submit" disabled={updateLoading} className="w-full bg-[#613de6] py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-[#613de6]/20 transition-all active:scale-95">
                {updateLoading ? "Saving Changes..." : "Confirm Profile Updates"}
               </button>
            )}
          </form>
        </div>

        {/* Global Message Feedback */}
        {passMessage.msg && (
          <div className={`flex items-center p-4 rounded-2xl text-[10px] font-black uppercase tracking-tight ${
            passMessage.type === 'success' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'
          }`}>
            {passMessage.type === 'success' ? <CheckCircle size={14} className="mr-2 shrink-0"/> : <AlertCircle size={14} className="mr-2 shrink-0"/>}
            {passMessage.msg}
          </div>
        )}

        {/* Referral System */}
        <div className="bg-[#1e293b] rounded-[2rem] p-6 border border-white/5 shadow-xl">
          <div className="flex items-center space-x-2 mb-4">
            <Share2 size={18} className="text-[#fc7952]" />
            <h3 className="font-black italic uppercase text-sm">Referral Network</h3>
          </div>
          <p className="text-[10px] text-white/50 mb-4 font-bold">Share your unique link and build your network.</p>
          <div className="flex items-center bg-black/40 p-3 rounded-2xl border border-white/10 gap-2">
            <div className="bg-[#0f172a] px-3 py-2 rounded-xl flex-1 border border-white/5 overflow-hidden">
                <p className="text-[10px] font-mono text-white/40 truncate">flyovahelp.com/register?ref={user?.uid}</p>
            </div>
            <button onClick={copyReferral} className={`px-4 py-3 rounded-xl font-black text-[10px] transition-all shrink-0 ${copied ? 'bg-green-500' : 'bg-[#613de6]'} text-white`}>
              {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        {/* Update Password */}
        <div className="bg-[#1e293b] rounded-[2rem] p-6 border border-white/5 shadow-xl">
          <div className="flex items-center space-x-2 mb-4">
            <Lock size={18} className="text-[#fc7952]" />
            <h3 className="font-black italic uppercase text-sm">Security</h3>
          </div>
          <form onSubmit={handlePasswordUpdate} className="space-y-4">
            <input 
              type="password" placeholder="New Password" value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold focus:border-[#613de6] outline-none text-white"
            />
            <button type="submit" disabled={passLoading || !newPassword} className="w-full bg-[#613de6] py-5 rounded-2xl font-black uppercase text-[11px] tracking-widest text-white disabled:opacity-20">
              {passLoading ? "Processing..." : "Save New Password"}
            </button>
          </form>
        </div>

        {/* Dangerous Actions */}
        <div className="pt-4 space-y-3">
          <button onClick={() => auth.signOut()} className="w-full py-5 rounded-2xl bg-white/5 text-white/40 font-black uppercase text-xs hover:bg-white/10 transition-all">
            Log Out of Session
          </button>
          <button onClick={() => setShowDeleteModal(true)} className="w-full py-5 rounded-2xl border-2 border-red-500/10 text-red-500 font-black uppercase text-xs flex items-center justify-center gap-2 hover:bg-red-500/5 transition-all">
            <Trash2 size={14} /> Delete Account Permanently
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-[#0f172a]/90 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="bg-[#1e293b] w-full max-w-sm rounded-[2.5rem] border border-white/10 p-8 shadow-2xl space-y-6">
              <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-3xl flex items-center justify-center mx-auto">
                <AlertCircle size={32} />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-black uppercase italic tracking-tighter mb-2">Delete Account?</h2>
                <p className="text-sm text-gray-400 font-bold leading-relaxed">
                  This action is permanent. All your wallet data, referral history, and profile will be erased forever.
                </p>
              </div>
              <div className="space-y-3">
                <button onClick={handleDeleteAccount} disabled={deleteLoading} className="w-full bg-red-500 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2">
                   {deleteLoading ? "Erasing Data..." : "YES, DELETE EVERYTHING"}
                </button>
                <button onClick={() => setShowDeleteModal(false)} className="w-full py-4 rounded-2xl bg-white/5 font-black uppercase text-[10px] tracking-widest">
                   No, Keep My Account
                </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}