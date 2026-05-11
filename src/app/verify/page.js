"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, updateDoc, doc } from "firebase/firestore";
import { ShieldCheck, ArrowRight, Loader2, CheckCircle2, AlertCircle, Mail, RotateCcw } from "lucide-react";

function OtpInput({ value, onChange }) {
  const inputs = useRef([]);
  const digits = value.split("").concat(Array(6).fill("")).slice(0, 6);

  const handleKey = (i, e) => {
    if (e.key === "Backspace") {
      if (!digits[i] && i > 0) {
        const next = digits.slice();
        next[i - 1] = "";
        onChange(next.join(""));
        inputs.current[i - 1]?.focus();
      } else {
        const next = digits.slice();
        next[i] = "";
        onChange(next.join(""));
      }
    }
  };

  const handleChange = (i, val) => {
    const d = val.replace(/\D/, "").slice(-1);
    const next = digits.slice();
    next[i] = d;
    onChange(next.join(""));
    if (d && i < 5) inputs.current[i + 1]?.focus();
  };

  const handlePaste = (e) => {
    const paste = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    onChange(paste.padEnd(6, "").slice(0, 6).trimEnd());
    inputs.current[Math.min(paste.length, 5)]?.focus();
    e.preventDefault();
  };

  return (
    <div className="flex gap-2.5 justify-center">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (inputs.current[i] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={handlePaste}
          className="w-12 h-14 text-center text-xl font-black rounded-2xl bg-[#0f172a] border-2 text-white outline-none transition-all"
          style={{ borderColor: d ? "#613de6" : "rgba(255,255,255,0.07)" }}
        />
      ))}
    </div>
  );
}

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email");

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!email) router.push("/register");
  }, [email, router]);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (otp.replace(/\D/g, "").length < 6) return setError("Please enter the full 6-digit code.");
    setLoading(true);
    setError("");

    try {
      const q = query(collection(db, "users"), where("email", "==", email));
      const snap = await getDocs(q);

      if (snap.empty) { setError("User record not found."); setLoading(false); return; }

      const userDoc = snap.docs[0];
      if (userDoc.data().otp === otp) {
        await updateDoc(doc(db, "users", userDoc.id), { verified: true, otp: null });
        setSuccess(true);
        setTimeout(() => router.push("/login"), 2200);
      } else {
        setError("The code you entered is incorrect. Please try again.");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none select-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-150 h-75 bg-[#613de6] rounded-full opacity-[0.12] blur-[100px]" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-100 h-75 bg-[#fc7952] rounded-full opacity-[0.07] blur-[110px]" />
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

        {!success ? (
          <div className="w-full max-w-105 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-3xl bg-[#613de6]/20 border border-[#613de6]/30 flex items-center justify-center">
                <ShieldCheck size={36} className="text-[#613de6]" />
              </div>
            </div>

            {/* Heading */}
            <div className="text-center mb-8">
              <h1 className="text-4xl font-black italic uppercase tracking-tighter leading-none mb-2">
                Verify <span className="text-[#613de6]">Identity</span>
              </h1>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-500 leading-relaxed">
                6-digit code sent to
              </p>
              <p className="text-sm font-black text-white mt-0.5">{email}</p>
            </div>

            <div className="bg-[#1e293b] border border-white/5 rounded-3xl p-7 shadow-2xl shadow-black/50 space-y-5">
              {error && (
                <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-2xl text-xs font-bold">
                  <AlertCircle size={14} className="shrink-0" /> {error}
                </div>
              )}

              <form onSubmit={handleVerify} className="space-y-5">
                <OtpInput value={otp} onChange={setOtp} />

                <button
                  type="submit"
                  disabled={loading || otp.length < 6}
                  className="w-full flex items-center justify-center gap-2 bg-[#613de6] hover:brightness-110 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-[#613de6]/25 active:scale-95 transition-all disabled:opacity-40"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <>Verify Account <ArrowRight size={16} /></>}
                </button>
              </form>

              {/* Info */}
              <div className="flex items-start gap-3 bg-white/4 border border-white/5 rounded-2xl p-4">
                <Mail size={15} className="text-[#613de6] shrink-0 mt-0.5" />
                <p className="text-[10px] font-bold text-gray-400 uppercase leading-relaxed">
                  Check your <span className="text-white">inbox or spam</span>. The code is required to activate your account.
                </p>
              </div>
            </div>

            <div className="mt-5 text-center">
              <button
                onClick={() => router.push("/register")}
                className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-gray-500 hover:text-gray-300 transition-colors mx-auto"
              >
                <RotateCcw size={12} /> Wrong email? Re-register
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-6 animate-in zoom-in-95 duration-500">
            <div className="w-24 h-24 bg-emerald-500/20 rounded-3xl flex items-center justify-center mx-auto border border-emerald-500/20 shadow-xl shadow-emerald-500/10">
              <CheckCircle2 size={44} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-4xl font-black italic uppercase tracking-tighter">Verified!</h2>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-500 mt-3 leading-relaxed">
                Your account is now active.<br />Redirecting to login…
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="relative z-10 pb-6 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-700">
          Secure 2FA Verification
        </p>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
          <Loader2 size={28} className="animate-spin text-[#613de6]" />
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
