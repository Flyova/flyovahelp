"use client";
import { useState, useEffect } from "react";
import { db, auth } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged, updatePassword } from "firebase/auth";
import { 
  User, 
  Mail, 
  Lock, 
  Share2, 
  CheckCircle, 
  Copy, 
  ArrowLeft, 
  ShieldCheck,
  AlertCircle 
} from "lucide-react";
import { useRouter } from "next/navigation";

export default function Settings() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Password State
  const [newPassword, setNewPassword] = useState("");
  const [passLoading, setPassLoading] = useState(false);
  const [passMessage, setPassMessage] = useState({ type: "", msg: "" });

  // Referral State
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        return router.push("/login");
      }
      setUser(u);
      
      // Real-time listener for user document
      const unsubUser = onSnapshot(doc(db, "users", u.uid), (snap) => {
        if (snap.exists()) {
          setUserData(snap.data());
        }
        setLoading(false);
      });

      return () => unsubUser();
    });
    return () => unsub();
  }, [router]);

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
        setPassMessage({ type: "error", msg: "Please logout and login again to change password (Security Rule)." });
      } else {
        setPassMessage({ type: "error", msg: err.message });
      }
    }
    setPassLoading(false);
    setTimeout(() => setPassMessage({ type: "", msg: "" }), 5000);
  };

  const copyReferral = () => {
    if (!user?.uid) return;
    const link = `${window.location.origin}/register?ref=${user.uid}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Ensure we don't try to render until user is loaded
  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-white italic font-black uppercase tracking-widest">
        Loading Profile...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col pb-10">
     
      <div className="p-6 space-y-6 max-w-md mx-auto w-full">
        
        {/* Profile Card */}
        <div className="bg-[#1e293b] rounded-[2rem] p-6 border border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <User size={80} />
          </div>
          
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-16 h-16 bg-[#613de6] rounded-2xl flex items-center justify-center text-2xl font-black italic shadow-lg border-2 border-white/10">
              {userData?.username ? userData.username.charAt(0).toUpperCase() : "?"}
            </div>
            <div>
              <h2 className="text-2xl font-black italic uppercase text-[#fc7952] leading-none">
                {userData?.username || "Player"}
              </h2>
              <div className="flex items-center text-green-500 mt-1">
                <ShieldCheck size={12} className="mr-1" />
                <span className="text-[10px] font-black uppercase tracking-widest">Account Status: Active</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
              <p className="text-[9px] font-black uppercase text-white/40 mb-1">Email Address</p>
              <div className="flex items-center space-x-2">
                <Mail size={14} className="text-[#613de6]" />
                <span className="font-bold text-sm">{user.email}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Referral System */}
        <div className="bg-[#1e293b] rounded-[2rem] p-6 border border-white/5">
          <div className="flex items-center space-x-2 mb-4">
            <Share2 size={18} className="text-[#fc7952]" />
            <h3 className="font-black italic uppercase text-sm">Refer & Earn</h3>
          </div>
          <p className="text-[10px] text-white/50 mb-4 leading-relaxed font-bold">
            Share your link. When new users join using your ID, it will be recorded in our system.
          </p>
          
          <div className="flex items-center bg-black/40 p-3 rounded-2xl border border-white/10">
            <input 
              readOnly 
              value={user?.uid ? `${user.uid.slice(0, 15)}...` : "Loading..."}
              className="bg-transparent flex-1 text-xs font-mono text-white/60 outline-none"
            />
            <button 
              onClick={copyReferral}
              className={`flex items-center space-x-1 px-4 py-2 rounded-xl font-black italic uppercase text-[10px] transition-all active:scale-95 ${
                copied ? 'bg-green-500 text-white' : 'bg-[#613de6] text-white'
              }`}
            >
              {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        </div>

        {/* Security Section */}
        <div className="bg-[#1e293b] rounded-[2rem] p-6 border border-white/5">
          <div className="flex items-center space-x-2 mb-4">
            <Lock size={18} className="text-[#fc7952]" />
            <h3 className="font-black italic uppercase text-sm">Security</h3>
          </div>

          <form onSubmit={handlePasswordUpdate} className="space-y-4">
            <div>
              <input 
                type="password"
                placeholder="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold focus:outline-none focus:border-[#613de6] transition-all text-white placeholder:text-white/20"
              />
            </div>

            {passMessage.msg && (
              <div className={`flex items-center p-3 rounded-xl text-[10px] font-black uppercase ${
                passMessage.type === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
              }`}>
                {passMessage.type === 'success' ? <CheckCircle size={14} className="mr-2"/> : <AlertCircle size={14} className="mr-2"/>}
                {passMessage.msg}
              </div>
            )}

            <button 
              type="submit"
              disabled={passLoading || !newPassword}
              className="w-full bg-[#613de6] py-4 rounded-2xl font-black italic uppercase shadow-lg disabled:opacity-20 active:scale-95 transition-all text-white"
            >
              {passLoading ? "Updating..." : "Update Password"}
            </button>
          </form>
        </div>

        {/* Logout Button */}
        <button 
          onClick={() => auth.signOut()}
          className="w-full py-4 rounded-2xl border-2 border-red-500/20 text-red-500 font-black italic uppercase text-sm hover:bg-red-500/10 active:scale-[0.98] transition-all"
        >
          Sign Out of Flyova
        </button>

      </div>
    </div>
  );
}