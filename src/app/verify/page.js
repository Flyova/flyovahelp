"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc 
} from "firebase/firestore";
import { 
  X, 
  ShieldCheck, 
  ArrowRight, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Mail
} from "lucide-react";

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email");
  
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Redirect if no email is present
  useEffect(() => {
    if (!email) {
      router.push("/register");
    }
  }, [email, router]);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (otp.length < 6) return setError("Please enter the full 6-digit code.");

    setLoading(true);
    setError("");

    try {
      // Find the user with this email in Firestore
      const q = query(collection(db, "users"), where("email", "==", email));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setError("User record not found.");
        setLoading(false);
        return;
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();

      // Check if OTP matches the one generated during registration
      if (userData.otp === otp) {
        // Update user to verified and clear the OTP
        await updateDoc(doc(db, "users", userDoc.id), {
          verified: true,
          otp: null 
        });

        setSuccess(true);
        // Delay slightly so the user sees the success state
        setTimeout(() => {
          router.push("/login");
        }, 2000);
      } else {
        setError("The code you entered is incorrect.");
      }
    } catch (err) {
      console.error("Verification Error:", err);
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col p-6">
      <div className="flex justify-end items-center mb-12">
        <button onClick={() => router.push('/register')} className="text-gray-500 hover:text-white transition-colors">
          <X size={28} />
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        {!success ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
              <h1 className="text-4xl font-black italic uppercase tracking-tighter mb-2">
                Verify <br /><span className="text-[#613de6]">Identity</span>
              </h1>
              <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest leading-relaxed">
                We've sent a 6-digit verification code to <br />
                <span className="text-white italic">{email}</span>
              </p>
            </div>

            <form onSubmit={handleVerify} className="space-y-6">
              <div className="relative">
                <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                <input 
                  type="text"
                  required
                  maxLength={6}
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  className="w-full bg-[#1e293b] border border-white/5 p-6 pl-14 rounded-3xl text-2xl font-black tracking-[0.5em] focus:border-[#613de6] outline-none transition-all placeholder:opacity-20 placeholder:tracking-normal"
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
                className="w-full bg-[#613de6] py-5 rounded-3xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-[#613de6]/20 active:scale-95 transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" /> : <>VERIFY ACCOUNT <ArrowRight size={18} /></>}
              </button>
            </form>

            <div className="bg-white/5 border border-white/5 p-5 rounded-3xl flex items-start gap-3">
                <Mail size={18} className="text-[#613de6] shrink-0 mt-1" />
                <p className="text-[9px] font-bold text-gray-400 uppercase leading-normal">
                    Check your <span className="text-white">Inbox or Spam</span>. The code is required to activate your account. .
                </p>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-6 animate-in zoom-in duration-500">
            <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
              <CheckCircle2 className="text-emerald-500" size={48} />
            </div>
            <div>
              <h2 className="text-3xl font-black uppercase italic tracking-tighter">Verified!</h2>
              <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-2 leading-relaxed">
                Your account is now active. <br /> Redirecting to login...
              </p>
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-[10px] font-bold text-gray-600 uppercase tracking-widest mt-8">
        Secure 2FA Verification
      </p>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0f172a] flex items-center justify-center font-black italic opacity-20 text-white">LOADING...</div>}>
      <VerifyContent />
    </Suspense>
  );
}