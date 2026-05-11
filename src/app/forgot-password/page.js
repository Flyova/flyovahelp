"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { auth } from "@/lib/firebase";
import { sendPasswordResetEmail } from "firebase/auth";
import { Mail, ArrowRight, Loader2, CheckCircle2, AlertCircle, Inbox, ArrowLeft } from "lucide-react";

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
      await sendPasswordResetEmail(auth, email);
      setSubmitted(true);
    } catch {
      setError("We couldn't find an account with that email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none select-none overflow-hidden">
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-150 h-75 bg-[#613de6] rounded-full opacity-[0.12] blur-[100px]" />
        <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-100 h-75 bg-[#fc7952] rounded-full opacity-[0.07] blur-[110px]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[22vw] font-black italic uppercase tracking-tighter text-white/[0.022] whitespace-nowrap leading-none">
            FLYOVAHELP
          </span>
        </div>
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 py-12">
        <Link href="/" className="mb-10">
          <Image src="/logo.svg" alt="Flyovahelp" width={120} height={30} />
        </Link>

        <div className="w-full max-w-105">
          {!submitted ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Icon */}
              <div className="flex justify-center mb-6">
                <div className="w-20 h-20 rounded-3xl bg-[#613de6]/20 border border-[#613de6]/30 flex items-center justify-center">
                  <Mail size={36} className="text-[#613de6]" />
                </div>
              </div>

              {/* Heading */}
              <div className="text-center mb-8">
                <h1 className="text-4xl font-black italic uppercase tracking-tighter leading-none mb-2">
                  Reset <span className="text-[#613de6]">Password</span>
                </h1>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-500">
                  Enter your email to receive recovery instructions
                </p>
              </div>

              <div className="bg-[#1e293b] border border-white/5 rounded-3xl p-7 shadow-2xl shadow-black/50 space-y-4">
                {error && (
                  <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-2xl text-xs font-bold">
                    <AlertCircle size={14} className="shrink-0" /> {error}
                  </div>
                )}

                <form onSubmit={handleReset} className="space-y-4">
                  <div className="relative">
                    <Mail size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                    <input
                      type="email"
                      required
                      placeholder="Account Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-[#0f172a] border border-white/5 focus:border-[#613de6]/60 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-bold text-white placeholder:text-gray-600 outline-none transition-colors"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-[#613de6] hover:brightness-110 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-[#613de6]/25 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {loading ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <>Send Recovery Link <ArrowRight size={16} /></>
                    )}
                  </button>
                </form>
              </div>

              <p className="text-center mt-6 text-xs font-bold text-gray-500">
                Remembered it?{" "}
                <Link href="/login" className="text-[#fc7952] font-black hover:brightness-110 transition-colors">
                  Back to Login
                </Link>
              </p>
            </div>
          ) : (
            <div className="text-center space-y-6 animate-in zoom-in-95 duration-500">
              {/* Success icon */}
              <div className="w-24 h-24 bg-emerald-500/15 rounded-3xl flex items-center justify-center mx-auto border border-emerald-500/20 shadow-xl shadow-emerald-500/10">
                <CheckCircle2 size={44} className="text-emerald-400" />
              </div>

              <div>
                <h2 className="text-4xl font-black italic uppercase tracking-tighter">Check Inbox</h2>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-500 mt-3 leading-relaxed">
                  If an account exists for
                </p>
                <p className="text-sm font-black text-white mt-0.5">{email}</p>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mt-1">
                  you will receive a reset link shortly
                </p>
              </div>

              {/* Spam note */}
              <div className="flex items-start gap-3 bg-white/4 border border-white/5 rounded-2xl p-4 text-left">
                <Inbox size={16} className="text-[#613de6] shrink-0 mt-0.5" />
                <p className="text-[10px] font-bold text-gray-400 uppercase leading-relaxed">
                  Don't see it? Check your{" "}
                  <span className="text-white">Spam or Junk</span> folder. Recovery emails are sometimes filtered by mistake.
                </p>
              </div>

              <button
                onClick={() => router.push("/login")}
                className="w-full flex items-center justify-center gap-2 bg-[#1e293b] border border-white/5 hover:border-white/15 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95"
              >
                <ArrowLeft size={16} /> Back to Login
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="relative z-10 pb-6 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-700">
          Secure Encryption Active
        </p>
      </div>
    </div>
  );
}
