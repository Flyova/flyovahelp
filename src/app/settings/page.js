"use client";
import { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { onAuthStateChanged, updatePassword } from "firebase/auth";
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
  Globe,
  Fingerprint,
  X,
  Clock
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authFetch } from "@/lib/authFetch";
import TxPinCard from "@/components/settings/TxPinCard";
import BankAccountCard from "@/components/settings/BankAccountCard";
import NotificationPrefsCard from "@/components/settings/NotificationPrefsCard";
import ProfileChangeForm from "@/components/settings/ProfileChangeForm";

export default function Settings() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [newUsername, setNewUsername] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newDob, setNewDob] = useState("");
  const [updateLoading, setUpdateLoading] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [passLoading, setPassLoading] = useState(false);
  const [passMessage, setPassMessage] = useState({ type: "", msg: "" });

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  // deletion_requests/{uid}: "unconfirmed" until the emailed link is clicked, then "pending".
  const [deletion, setDeletion] = useState(null);
  const [deleteSentTo, setDeleteSentTo] = useState("");

  const [copied, setCopied] = useState(false);
  const [pinCopied, setPinCopied] = useState(false);

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
      const unsubDeletion = onSnapshot(doc(db, "deletion_requests", u.uid), (snap) => {
        setDeletion(snap.exists() && snap.data().status !== "completed" ? snap.data() : null);
      }, () => setDeletion(null));
      return () => { unsubUser(); unsubDeletion(); };
    });
    return () => unsub();
  }, [router]);
  

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setUpdateLoading(true);
    setPassMessage({ type: "", msg: "" });

    try {
      // A new username costs $1 from the wallet (the server checks it's free and charges it).
      if (newUsername !== userData.username) {
        if (!window.confirm(`Change your username to @${newUsername.trim()}? It costs $1 from your wallet.`)) {
          setUpdateLoading(false);
          return;
        }
        const res = await authFetch("/api/wallet", { method: "POST", body: { action: "usernameChange", username: newUsername } });
        if (res.error) throw new Error(res.error);
      }

      const updates = {};
      if (!userData.phone && newPhone) updates.phone = newPhone;
      if (!userData.dob && newDob) updates.dob = newDob;
      if (Object.keys(updates).length > 0) await updateDoc(doc(db, "users", user.uid), updates);
      if (newUsername !== userData.username || Object.keys(updates).length > 0) {
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

  // The request reaches the admins only once the player clicks the link we email (/api/account).
  const requestAccountDeletion = async () => {
    setDeleteLoading(true);
    const res = await authFetch("/api/account", { method: "POST", body: { action: "deleteRequest" } });
    setDeleteLoading(false);
    if (res.error) return alert(res.error);
    setDeleteSentTo(res.sentTo);
    setShowDeleteModal(false);
  };

  const cancelAccountDeletion = async () => {
    if (!confirm("Cancel your account deletion request?")) return;
    const res = await authFetch("/api/account", { method: "POST", body: { action: "deleteCancel" } });
    if (res.error) alert(res.error);
    setDeleteSentTo("");
  };

  const copyPin = () => {
    const pinToCopy = userData?.pin || "";
    if (!pinToCopy) return;
    navigator.clipboard.writeText(pinToCopy);
    setPinCopied(true);
    setTimeout(() => setPinCopied(false), 2000);
  };

  const referralRef = userData?.referralCode || user?.uid;
  const copyReferral = () => {
    if (!referralRef) return;
    const link = `https://strawins.com/register?ref=${referralRef}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#0B1220] flex items-center justify-center text-white italic font-black uppercase tracking-widest">
        Loading Profile...
      </div>
    );
  }

  const hasChanges = newUsername !== userData?.username || (!userData?.phone && newPhone) || (!userData?.dob && newDob);

  return (
    <div className="min-h-screen bg-[#0B1220] text-white flex flex-col pb-10">
      
      <div className="p-6 pt-12 flex items-center gap-4 max-w-md mx-auto w-full">
        <button onClick={() => router.back()} className="p-3 bg-[#142036] rounded-2xl border border-white/5 active:scale-90 transition-all">
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-xl font-black italic uppercase tracking-tighter">Account Settings</h1>
      </div>
     
      <div className="p-6 space-y-6 max-w-md mx-auto w-full">

        {/* Deletion request: waiting for the emailed link, then for an admin */}
        {deletion && (
          <div className="bg-amber-500/10 border border-amber-500/30 p-5 rounded-[2rem] flex items-start gap-4">
            <Clock className="text-amber-500 shrink-0" size={20} />
            <div className="flex-1">
              <p className="text-[11px] font-black uppercase italic text-amber-500 leading-tight">
                {deletion.emailConfirmedAt ? "Account Deletion Pending" : "Confirm From Your Email"}
              </p>
              <p className="text-[10px] font-bold text-gray-400 mt-1 leading-snug">
                {deletion.emailConfirmedAt
                  ? "You confirmed it. An administrator will process your request soon."
                  : `We emailed a link to ${deleteSentTo || "your email"}. Click it to confirm; until then nothing is deleted.`}
              </p>
              <div className="flex gap-2 mt-3">
                {!deletion.emailConfirmedAt && (
                  <button onClick={requestAccountDeletion} disabled={deleteLoading} className="px-3 py-2 rounded-xl bg-amber-500/20 text-amber-400 text-[9px] font-black uppercase">
                    {deleteLoading ? "Sending…" : "Resend Link"}
                  </button>
                )}
                <button onClick={cancelAccountDeletion} className="px-3 py-2 rounded-xl bg-white/5 text-white/60 text-[9px] font-black uppercase">
                  Cancel Request
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Profile Card */}
        <div className="bg-[#142036] rounded-[2.5rem] p-6 border border-white/5 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <User size={100} />
          </div>
          
          <div className="flex items-center space-x-4 mb-6 relative z-10">
            {/* The account's initial: profile photos belong to chat profiles (Chat settings). */}
            <span className="w-16 h-16 shrink-0 rounded-2xl bg-gradient-to-br from-[#8B1E3F] to-[#5A1229] border-2 border-white/10 shadow-lg flex items-center justify-center text-2xl font-black uppercase">
              {String(userData?.fullName || userData?.username || "S").trim().charAt(0)}
            </span>
            <div>
              <h2 className="text-2xl font-black italic uppercase text-[#8B1E3F] leading-none">
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
            <div className="bg-black/20 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black uppercase text-white/40 mb-1">Account PIN</p>
                <div className="flex items-center gap-2">
                  <Fingerprint size={14} className="text-[#2457D6]" />
                  <p className="font-mono text-sm font-black tracking-[0.4em] text-white">
                    {userData?.pin || "XXXXX"}
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={copyPin}
                className={`p-3 rounded-xl transition-all active:scale-90 ${pinCopied ? 'bg-green-500' : 'bg-[#2457D6]'}`}
              >
                {pinCopied ? <CheckCircle size={14} /> : <Copy size={14} />}
              </button>
            </div>

            <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
              <p className="text-[9px] font-black uppercase text-white/40 mb-2">Unique Username · $1 to change</p>
              <div className="flex items-center gap-2">
                <UserPen size={16} className="text-[#2457D6]" />
                <input 
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="flex-1 bg-transparent font-bold text-sm outline-none text-white placeholder:text-white/20"
                />
              </div>
            </div>

            <div className="bg-black/20 p-4 rounded-2xl border border-white/5 opacity-60">
              <p className="text-[9px] font-black uppercase text-white/40 mb-2">Email Address</p>
              <div className="flex items-center gap-2">
                <Mail size={16} className="text-gray-500" />
                <input 
                  value={userData?.email || user?.email || ""}
                  readOnly
                  className="flex-1 bg-transparent font-bold text-sm outline-none text-white/50 cursor-not-allowed"
                />
              </div>
            </div>

            <ProfileChangeForm fullName={userData?.fullName} email={userData?.email || user?.email} />

             <div className="bg-black/20 p-4 rounded-2xl border border-white/5 opacity-60">
              <p className="text-[9px] font-black uppercase text-white/40 mb-2">Registered Country</p>
              <div className="flex items-center gap-2">
                <Globe size={16} className="text-gray-500" />
                <input 
                  value={userData?.country || "Not Specified"}
                  readOnly
                  className="flex-1 bg-transparent font-bold text-sm outline-none text-white/50 cursor-not-allowed"
                />
              </div>
            </div>

            <div className={`bg-black/20 p-4 rounded-2xl border border-white/5 ${userData?.phone ? 'opacity-60' : ''}`}>
              <p className="text-[9px] font-black uppercase text-white/40 mb-2">Phone Number</p>
              <div className="flex items-center gap-2">
                <Phone size={16} className={userData?.phone ? "text-gray-500" : "text-[#2457D6]"} />
                <input 
                  value={newPhone}
                  placeholder="e.g. +44 7700 900000"
                  readOnly={!!userData?.phone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className={`flex-1 bg-transparent font-bold text-sm outline-none text-white placeholder:text-white/20 ${userData?.phone ? 'cursor-not-allowed text-white/50' : ''}`}
                />
              </div>
            </div>

            <div className={`bg-black/20 p-4 rounded-2xl border border-white/5 ${userData?.dob ? 'opacity-60' : ''}`}>
              <p className="text-[9px] font-black uppercase text-white/40 mb-2">Date of Birth</p>
              <div className="flex items-center gap-2">
                <Calendar size={16} className={userData?.dob ? "text-gray-500" : "text-[#2457D6]"} />
                <input 
                  type={userData?.dob ? "text" : "date"}
                  value={newDob}
                  readOnly={!!userData?.dob}
                  onChange={(e) => setNewDob(e.target.value)}
                  className={`flex-1 bg-transparent font-bold text-sm outline-none text-white invert-[0.1] brightness-200 ${userData?.dob ? 'cursor-not-allowed text-white/50 invert-0' : ''}`}
                />
              </div>
            </div>

            {hasChanges && (
               <button type="submit" disabled={updateLoading} className="w-full bg-[#2457D6] py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-[#2457D6]/20 transition-all active:scale-95">
                {updateLoading ? "Saving Changes..." : newUsername !== userData?.username ? "Change Username ($1)" : "Confirm Profile Updates"}
               </button>
            )}
          </form>
        </div>

        {passMessage.msg && (
          <div className={`flex items-center p-4 rounded-2xl text-[10px] font-black uppercase tracking-tight ${
            passMessage.type === 'success' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'
          }`}>
            {passMessage.type === 'success' ? <CheckCircle size={14} className="mr-2 shrink-0"/> : <AlertCircle size={14} className="mr-2 shrink-0"/>}
            {passMessage.msg}
          </div>
        )}

        <div className="bg-[#142036] rounded-[2rem] p-6 border border-white/5 shadow-xl">
          <div className="flex items-center space-x-2 mb-4">
            <Share2 size={18} className="text-[#8B1E3F]" />
            <h3 className="font-black italic uppercase text-sm">Referral CODE</h3>
          </div>
          <p className="text-[10px] text-white/50 mb-4 font-bold">
            Share your unique link and build your network. Your code and sign-up rewards are on the <Link href="/referrals" className="text-[#2457D6]">Referrals page</Link>.
          </p>
          {userData?.referralCode && (
            <p className="mb-3 font-mono text-lg font-black tracking-[0.3em] text-white">{userData.referralCode}</p>
          )}
          <div className="flex items-center bg-black/40 p-3 rounded-2xl border border-white/10 gap-2">
            <div className="bg-[#0B1220] px-3 py-2 rounded-xl flex-1 border border-white/5 overflow-hidden">
                <p className="text-[10px] font-mono text-white/40 truncate">strawins.com/register?ref={referralRef}</p>
            </div>
            <button onClick={copyReferral} className={`px-4 py-3 rounded-xl font-black text-[10px] transition-all shrink-0 ${copied ? 'bg-green-500' : 'bg-[#2457D6]'} text-white`}>
              {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        <TxPinCard hasTxPin={!!userData?.hasTxPin} />

        <BankAccountCard bank={userData?.bank?.accountNumber ? userData.bank : null} fullName={userData?.fullName} hasTxPin={!!userData?.hasTxPin} />

        <NotificationPrefsCard uid={user.uid} prefs={userData?.notificationPrefs} />

        <div className="bg-[#142036] rounded-[2rem] p-6 border border-white/5 shadow-xl">
          <div className="flex items-center space-x-2 mb-4">
            <Lock size={18} className="text-[#8B1E3F]" />
            <h3 className="font-black italic uppercase text-sm">Password</h3>
          </div>
          <form onSubmit={handlePasswordUpdate} className="space-y-4">
            <input 
              type="password" placeholder="New Password" value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold focus:border-[#2457D6] outline-none text-white"
            />
            <button type="submit" disabled={passLoading || !newPassword} className="w-full bg-[#2457D6] py-5 rounded-2xl font-black uppercase text-[11px] tracking-widest text-white disabled:opacity-20">
              {passLoading ? "Processing..." : "Save New Password"}
            </button>
          </form>
        </div>

        <div className="pt-4 space-y-3">
          <button onClick={() => auth.signOut()} className="w-full py-5 rounded-2xl bg-white/5 text-white/40 font-black uppercase text-xs hover:bg-white/10 transition-all">
            Log Out of Session
          </button>
          <button 
            disabled={!!deletion}
            onClick={() => setShowDeleteModal(true)} 
            className="w-full py-5 rounded-2xl border-2 border-red-500/10 text-red-500 font-black uppercase text-xs flex items-center justify-center gap-2 hover:bg-red-500/5 transition-all disabled:opacity-30 disabled:grayscale"
          >
            <Trash2 size={14} /> {deletion ? "Deletion Request Submitted" : "Delete Account Permanently"}
          </button>
        </div>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-[#0B1220]/90 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="bg-[#142036] w-full max-w-sm rounded-[2.5rem] border border-white/10 p-8 shadow-2xl space-y-6">
              <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-3xl flex items-center justify-center mx-auto">
                <AlertCircle size={32} />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-black uppercase italic tracking-tighter mb-2">Request Deletion?</h2>
                <p className="text-sm text-gray-400 font-bold leading-relaxed">
                  We&apos;ll email you a link to confirm. Once you confirm and an admin approves it, your wallet, history, and profile will be erased forever.
                </p>
              </div>
              <div className="space-y-3">
                <button onClick={requestAccountDeletion} disabled={deleteLoading} className="w-full bg-red-500 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2">
                   {deleteLoading ? "Sending..." : "EMAIL ME THE CONFIRMATION LINK"}
                </button>
                <button onClick={() => setShowDeleteModal(false)} className="w-full py-4 rounded-2xl bg-white/5 font-black uppercase text-[10px] tracking-widest">
                   Cancel Request
                </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}