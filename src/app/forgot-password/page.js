"use client";
import { useState } from "react";
import { auth } from "@/lib/firebase";
import { sendPasswordResetEmail } from "firebase/auth";
import { useRouter } from "next/navigation";
import { 
  X, 
  Mail, 
  ArrowRight, 
  Loader2, 
  CheckCircle2, 
  AlertCircle 
} from "lucide-react";

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleReset = async (e) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError("");

    try {
      // 1. Send the standard Firebase Reset Link
      await sendPasswordResetEmail(auth, email);

      // 2. Trigger our Custom Branded Notification
      await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          subject: "Password Reset Request",
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; border: 1px solid #ddd; border-radius: 12px;">
              <h2 style="color: #613de6; border-bottom: 1px solid #eee; padding-bottom: 10px;">Security Alert</h2>
              <p>Hello,</p>
              <p>A password reset request was initiated for your Flyova Global Network account.</p>
              <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #eee;">
                <p style="margin: 5px 0;">If you made this request, please follow the instructions in the official Firebase security email sent to this address.</p>
                <p style="margin: 5px 0; color: #fc7952; font-weight: bold;">If you did not request this, please secure your account immediately.</p>
              </div>
              <p>For your safety, password reset links expire after a short period.</p>
              <div style="margin-top: 30px; font-size: 11px; color: #777; border-top: 1px solid #eee; padding-top: 15px;">
                Flyova Security Systems
              </div>
            </div>
          `
        })
      });

      setSubmitted(true);
    } catch (err) {
      setError("We couldn't find an account with that email.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col p-6">
      {/* Header */}
      <div className="flex justify-end items-center mb-12">
        <button onClick={() => router.push('/login')} className="text-gray-500 hover:text-white transition-colors">
          <X size={28} />
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        {!submitted ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
              <h1 className="text-4xl font-black italic uppercase tracking-tighter mb-2">
                Reset <br /><span className="text-[#613de6]">Password</span>
              </h1>
              <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">
                Enter your email to receive recovery instructions.
              </p>
            </div>

            <form onSubmit={handleReset} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                <input 
                  type="email"
                  required
                  placeholder="Account Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#1e293b] border border-white/5 p-5 pl-12 rounded-2xl text-sm font-bold focus:border-[#613de6] outline-none transition-all placeholder:opacity-20"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-rose-500 text-[10px] font-black uppercase bg-rose-500/10 p-4 rounded-xl border border-rose-500/20">
                  <AlertCircle size={14} /> {error}
                </div>
              )}

              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-[#613de6] py-5 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-[#613de6]/20 active:scale-95 transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" /> : <>SEND RECOVERY LINK <ArrowRight size={18} /></>}
              </button>
            </form>
          </div>
        ) : (
          <div className="text-center space-y-6 animate-in zoom-in duration-500">
            <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
              <CheckCircle2 className="text-emerald-500" size={40} />
            </div>
            <div>
              <h2 className="text-2xl font-black uppercase italic tracking-tighter">Check Your Inbox</h2>
              <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-2 leading-relaxed">
                If an account exists for <span className="text-white">{email}</span>, <br /> you will receive a reset link shortly.
              </p>
            </div>
            <button 
              onClick={() => router.push('/login')}
              className="w-full bg-white/5 border border-white/5 py-5 rounded-2xl font-black uppercase text-xs tracking-widest"
            >
              Back to Login
            </button>
          </div>
        )}
      </div>

      <p className="text-center text-[10px] font-bold text-gray-600 uppercase tracking-widest mt-8">
        Secure Encryption Active
      </p>
    </div>
  );
}