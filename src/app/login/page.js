"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Mail, Lock, ArrowRight, Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, updateDoc, getDoc, serverTimestamp } from "firebase/firestore";

const VERIFICATION_BYPASS_EMAIL = "contact.flyovahelp@gmail.com";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [formData, setFormData] = useState({ email: "", password: "" });

  const generateUserPin = () => Math.floor(10000000 + Math.random() * 90000000).toString();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const cred = await signInWithEmailAndPassword(auth, formData.email, formData.password);
      const normalizedLoginEmail = (cred.user.email || formData.email || "").trim().toLowerCase();
      const verificationBypass = normalizedLoginEmail === VERIFICATION_BYPASS_EMAIL;
      const userRef = doc(db, "users", cred.user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await signOut(auth);
        setError("Account profile is missing. Please contact support.");
        setLoading(false);
        return;
      }
      const userData = userSnap.data();

      if (userData?.verified !== true && !verificationBypass) {
        await signOut(auth);
        const verifyEmail = encodeURIComponent(cred.user.email || formData.email);
        router.push(`/verify?email=${verifyEmail}`);
        setLoading(false);
        return;
      }

      if (userData?.isban === true) {
        await signOut(auth);
        setError("This account is disabled. Please contact support for assistance.");
        setLoading(false);
        return;
      }

      const updateData = { status: "online", lastSeen: serverTimestamp() };
      if (!userData?.pin) updateData.pin = generateUserPin();
      await updateDoc(userRef, updateData);
      router.push("/dashboard");
    } catch {
      setError("Invalid email or password.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none select-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] bg-[#613de6] rounded-full opacity-[0.13] blur-[110px]" />
        <div className="absolute -bottom-32 -right-16 w-[400px] h-[400px] bg-[#fc7952] rounded-full opacity-[0.09] blur-[110px]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[22vw] font-black italic uppercase tracking-tighter text-white/[0.022] whitespace-nowrap leading-none">
            FLYOVAHELP
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 py-12">
        {/* Logo */}
        <Link href="/">
          <Image src="/logo.svg" alt="Flyovahelp" width={130} height={34} className="mb-10 cursor-pointer" />
        </Link>

        {/* Card */}
        <div className="w-full max-w-[420px]">
          {/* Heading above card */}
          <div className="mb-6 px-1">
            <h1 className="text-4xl font-black italic uppercase tracking-tighter leading-none">
              Welcome <span className="text-[#613de6]">Back</span>
            </h1>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 mt-2">
              Sign in to your account
            </p>
          </div>

          <div className="bg-[#1e293b] border border-white/5 rounded-3xl p-7 shadow-2xl shadow-black/50">
            {error && (
              <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-2xl text-xs font-bold mb-5">
                <AlertCircle size={14} className="shrink-0" /> {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-3">
              {/* Email */}
              <div className="relative">
                <Mail size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                <input
                  type="email"
                  placeholder="Email Address"
                  required
                  autoComplete="email"
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-[#0f172a] border border-white/5 focus:border-[#613de6]/60 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-bold text-white placeholder:text-gray-600 outline-none transition-colors"
                />
              </div>

              {/* Password */}
              <div className="relative">
                <Lock size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                <input
                  type={showPw ? "text" : "password"}
                  placeholder="Password"
                  required
                  autoComplete="current-password"
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full bg-[#0f172a] border border-white/5 focus:border-[#613de6]/60 rounded-2xl pl-11 pr-11 py-3.5 text-sm font-bold text-white placeholder:text-gray-600 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((p) => !p)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              <div className="flex justify-end pt-0.5">
                <Link
                  href="/forgot-password"
                  className="text-[10px] font-black uppercase tracking-wider text-gray-500 hover:text-[#fc7952] transition-colors"
                >
                  Forgot Password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-[#613de6] hover:brightness-110 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-[#613de6]/25 active:scale-95 transition-all disabled:opacity-50 mt-1"
              >
                {loading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>Sign In <ArrowRight size={16} /></>
                )}
              </button>
            </form>
          </div>

          {/* Bottom link */}
          <p className="text-center mt-6 text-xs font-bold text-gray-500">
            New to Flyovahelp?{" "}
            <Link href="/register" className="text-[#fc7952] font-black hover:brightness-110 transition-colors">
              Create Account
            </Link>
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 pb-6 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-700">
          Play Responsibly · 18+ Only
        </p>
      </div>
    </div>
  );
}
