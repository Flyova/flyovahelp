"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { Timer, Copy, CheckCircle, AlertTriangle, Loader2, QrCode } from "lucide-react";
import QRCode from "react-qr-code";

function DirectDepositContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const amount = searchParams.get("amount") || "0";
  const [timeLeft, setTimeLeft] = useState(1800); // 30 Minutes
  const [isSubmitting, setIsSubmitting] = useState(false);
  const USDT_ADDRESS = "TVatYHhNgVriJQwvyzUvo2jYbNqxVKqk1Q";

  useEffect(() => {
    if (timeLeft <= 0) {
      alert("Payment Session Expired");
      router.push("/deposit");
      return;
    }
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, router]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(USDT_ADDRESS);
    alert("Address copied!");
  };

  const handlePaid = async () => {
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "deposits"), {
        userId: auth.currentUser.uid,
        amount: parseFloat(amount),
        type: "USDT_DIRECT",
        status: "pending",
        network: "TRC20",
        addressUsed: USDT_ADDRESS,
        createdAt: serverTimestamp(),
      });
      router.push("/dashboard"); 
      alert("Deposit Logged! Please wait for confirmation.");
    } catch (error) {
      alert("Error logging deposit. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white p-6 flex flex-col items-center">
      <div className="max-w-md w-full space-y-8 pt-10">
        
        {/* Header & Timer */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black italic uppercase text-white">Complete Deposit</h1>
          <div className="flex items-center justify-center gap-2 text-[#fc7952] font-bold">
            <Timer size={20} />
            <span className="text-2xl tabular-nums">{formatTime(timeLeft)}</span>
          </div>
        </div>

        <div className="bg-[#1e293b] p-8 rounded-[2.5rem] border border-white/5 shadow-2xl space-y-6">
          
          {/* Amount Display */}
          <div className="space-y-1 text-center">
            <p className="text-[10px] font-black text-gray-500 uppercase">Amount to Send</p>
            <p className="text-4xl font-black text-[#613de6] italic">${amount} <span className="text-sm">USDT</span></p>
          </div>

          {/* Network Warning */}
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex gap-3">
            <AlertTriangle className="text-yellow-500 shrink-0" />
            <p className="text-[10px] font-bold text-yellow-200/80 leading-relaxed">
              ONLY send USDT via the <span className="text-yellow-500 font-black">TRC20 (Tron)</span> network. 
              Incorrect networks result in lost funds.
            </p>
          </div>

          {/* QR CODE SECTION */}
          <div className="flex flex-col items-center space-y-4 py-2">
            <div className="bg-white p-4 rounded-3xl shadow-xl shadow-black/20">
              <QRCode 
                value={USDT_ADDRESS}
                size={160}
                level="H"
                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
              />
            </div>
            <p className="text-[9px] font-black text-gray-500 uppercase flex items-center gap-2">
               <QrCode size={12} /> Scan to copy address
            </p>
          </div>

          {/* Wallet Address Copy Area */}
          <div className="space-y-3">
            <p className="text-[10px] font-black text-gray-500 uppercase ml-2">USDT TRC20 Address</p>
            <div className="bg-[#0f172a] p-4 rounded-2xl border border-white/5 flex items-center justify-between group active:scale-[0.98] transition-all">
              <span className="text-[10px] font-bold break-all mr-4 text-gray-300 group-hover:text-white">{USDT_ADDRESS}</span>
              <button 
                onClick={copyToClipboard} 
                className="p-3 bg-[#613de6] hover:bg-[#7251ed] rounded-xl shadow-lg transition-colors shrink-0"
              >
                <Copy size={16} />
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button 
            onClick={handlePaid}
            disabled={isSubmitting}
            className="w-full bg-[#fc7952] hover:bg-[#ff8a6a] py-5 rounded-3xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-[#fc7952]/20 active:scale-95 transition-all disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="animate-spin" /> : <CheckCircle size={18} />}
            I HAVE PAID
          </button>
        </div>

        <p className="text-center text-[10px] font-bold text-gray-600 uppercase tracking-widest">
            Automatic confirmation within 10 minutes
        </p>
      </div>
    </div>
  );
}

export default function DirectDeposit() {
    return (
        <Suspense fallback={
          <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
            <Loader2 className="animate-spin text-[#613de6]" size={40} />
          </div>
        }>
            <DirectDepositContent />
        </Suspense>
    );
}