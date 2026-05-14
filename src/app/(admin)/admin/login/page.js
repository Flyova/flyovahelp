"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, ShieldCheck, Lock, Loader2, AlertCircle } from "lucide-react";
// FIREBASE IMPORTS
import { auth, db } from "@/lib/firebase";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { resolvePrivilegedRole } from "@/lib/adminAccess";

export default function AdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "", 
    password: "",
  });

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const normalizedEmail = String(formData.email || "").trim().toLowerCase();
      const normalizedPassword = String(formData.password || "").trim();

      const signInWithBootstrapFallback = async () => {
        try {
          return await signInWithEmailAndPassword(auth, normalizedEmail, normalizedPassword);
        } catch (initialError) {
          const privilegedRole = resolvePrivilegedRole(null, normalizedEmail);
          if (!privilegedRole) throw initialError;

          const bootstrapRes = await fetch("/api/admin/bootstrap-auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: normalizedEmail,
              password: normalizedPassword,
            }),
          });

          if (!bootstrapRes.ok) {
            const payload = await bootstrapRes.json().catch(() => ({}));
            throw new Error(payload?.error || "Could not provision privileged account.");
          }

          return await signInWithEmailAndPassword(auth, normalizedEmail, normalizedPassword);
        }
      };

      // 1. Authenticate with Firebase Auth (auto-bootstrap for staff/support if needed)
      const userCredential = await signInWithBootstrapFallback();
      const uid = userCredential.user.uid;

      // 2. Fetch User Document to check Role
      const userDoc = await getDoc(doc(db, "users", uid));
      
      const mappedRoleFromEmail = resolvePrivilegedRole(null, userCredential.user.email);

      if (!userDoc.exists()) {
        if (!mappedRoleFromEmail) {
          await signOut(auth);
          setError("Unauthorized: profile record not found.");
          setLoading(false);
          return;
        }

        await setDoc(doc(db, "users", uid), {
          uid,
          email: userCredential.user.email || formData.email,
          username: (userCredential.user.email || formData.email || "staff").split("@")[0],
          fullName: "Portal Operator",
          role: mappedRoleFromEmail,
          status: "online",
          verified: true,
          createdAt: serverTimestamp(),
          lastAdminLogin: serverTimestamp()
        });
        router.push("/admin");
        return;
      }

      const userData = userDoc.data();
      const privilegedRole = resolvePrivilegedRole(userData.role, userCredential.user.email);

      if (privilegedRole) {
        // SUCCESS: User is privileged (admin/staff/support)
        await updateDoc(doc(db, "users", uid), {
          status: "online",
          role: privilegedRole,
          lastAdminLogin: serverTimestamp()
        });
        router.push("/admin");
      } else {
        // FAILURE: Not privileged - Logout immediately
        await signOut(auth);
        setError("Unauthorized: admin, staff, or support privileges required.");
        setLoading(false);
      }

    } catch (err) {
      setError(err?.message || "Invalid administrative credentials.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white flex flex-col p-6 items-center justify-center">
      <div className="w-full max-w-md space-y-8">
        
        {/* Admin Branding */}
        <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-[#613de6]/10 border border-[#613de6]/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="text-[#613de6]" size={32} />
            </div>
            <h1 className="text-3xl font-black italic uppercase tracking-tighter">
                CONTROL <span className="text-[#613de6]">PANEL</span>
            </h1>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">
                Admin · Staff · Support
            </p>
        </div>

        {/* Error Display */}
        {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl flex items-center gap-3 text-rose-500 animate-in shake duration-300">
                <AlertCircle size={18} />
                <span className="text-[10px] font-black uppercase">{error}</span>
            </div>
        )}

        {/* Form */}
        <form onSubmit={handleAdminLogin} className="space-y-4">
          <div className="relative">
             <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={18} />
             <input 
                type="email"
                placeholder="Portal Email"
                required
                className="w-full bg-[#1e293b]/50 border border-white/5 focus:border-[#613de6] p-5 pl-12 rounded-2xl outline-none transition-all font-bold text-sm placeholder:text-gray-700"
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
          </div>

          <div className="relative">
              <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={18} />
              <input 
                type="password"
                placeholder="Secure Password"
                required
                className="w-full bg-[#1e293b]/50 border border-white/5 focus:border-[#613de6] p-5 pl-12 rounded-2xl outline-none transition-all font-bold text-sm placeholder:text-gray-700"
                onChange={(e) => setFormData({...formData, password: e.target.value})}
              />
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-5 bg-[#613de6] hover:bg-[#724fff] text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all active:scale-[0.98] shadow-2xl shadow-[#613de6]/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : "Access Admin Panel"}
          </button>
        </form>

        <div className="text-center pt-4">
            <button 
                onClick={() => router.push('/login')}
                className="text-[10px] font-black text-gray-600 uppercase tracking-widest hover:text-white transition-colors"
            >
                Return to standard login
            </button>
        </div>
      </div>

      {/* Footer Decoration */}
      <div className="fixed bottom-8 flex items-center gap-2 opacity-20">
         <div className="h-px w-8 bg-gray-500" />
         <span className="text-[9px] font-black uppercase tracking-widest">Flyova Secure Terminal</span>
         <div className="h-px w-8 bg-gray-500" />
      </div>
    </div>
  );
}
