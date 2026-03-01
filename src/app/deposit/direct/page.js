"use client";
import { useState, useEffect, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { 
  Timer, Copy, CheckCircle, AlertTriangle, 
  Loader2, QrCode, ImageIcon, Hash, UploadCloud, X 
} from "lucide-react";
import QRCode from "react-qr-code";

function DirectDepositContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const amount = searchParams.get("amount") || "0";
  const depositId = searchParams.get("id"); // Get the ID created on the main deposit page
  
  const [timeLeft, setTimeLeft] = useState(1800); // Default 30 Minutes
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showProofForm, setShowProofForm] = useState(false);
  
  // Proof Form States
  const [hashId, setHashId] = useState("");
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileInputRef = useRef(null);

  const USDT_ADDRESS = "TNxbh5oFmPgGxXiJ44k3tXGP6zvLGhUCxQ";

  // Cloudinary Config (Based on your TradeRoom setup)
  const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dq9o866sc/image/upload";
  const UPLOAD_PRESET = "p_trade_proof"; 
  const API_KEY = "823961819667685";

  // SYNC TIMER WITH FIRESTORE CREATION TIME
  useEffect(() => {
    if (!depositId) return;

    const syncTimer = async () => {
      try {
        const docSnap = await getDoc(doc(db, "deposits", depositId));
        if (docSnap.exists()) {
          const createdAt = docSnap.data().createdAt?.toDate().getTime();
          if (createdAt) {
            const elapsed = Math.floor((Date.now() - createdAt) / 1000);
            const remaining = 1800 - elapsed;
            if (remaining <= 0) {
              alert("Payment Session Expired");
              router.push("/deposit");
            } else {
              setTimeLeft(remaining);
            }
          }
        }
      } catch (err) {
        console.error("Timer Sync Error:", err);
      }
    };
    syncTimer();
  }, [depositId, router]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(USDT_ADDRESS);
    alert("Address copied!");
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      setPreview(URL.createObjectURL(file));
    }
  };

 const handleSubmitDeposit = async (e) => {
    e.preventDefault();
    if (!hashId.trim()) return alert("Please enter the Transaction Hash/ID");
    if (!image) return alert("Please upload a payment screenshot");
    if (!auth.currentUser) return alert("Session expired. Please login again.");
    if (!depositId) return alert("Deposit session error. Please restart.");

    setIsSubmitting(true);
    try {
      // 1. Upload to Cloudinary
      const formData = new FormData();
      formData.append("file", image);
      formData.append("upload_preset", UPLOAD_PRESET);
      formData.append("api_key", API_KEY);

      const res = await fetch(CLOUDINARY_URL, {
        method: "POST",
        body: formData,
      });
      
      const uploadData = await res.json();
      
      if (!uploadData.secure_url) {
        throw new Error(uploadData.error?.message || "Image upload failed.");
      }

      const imageUrl = uploadData.secure_url;

      // 2. UPDATE THE EXISTING FIRESTORE RECORD
      await updateDoc(doc(db, "deposits", depositId), {
        transactionHash: hashId.trim(),
        proofImage: imageUrl,
        submittedAt: serverTimestamp(),
        status: "pending" 
      });

      // --- ADMIN NOTIFICATION ---
      try {
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: "arbie1877@gmail.com",
            subject: "New Deposit Proof Submitted",
            html: `
              <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #000; margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 10px;">Deposit Verification Required</h2>
                <p style="margin: 10px 0;"><strong>User ID:</strong> ${auth.currentUser.uid}</p>
                <p style="margin: 10px 0;"><strong>Amount:</strong> $${amount} USDT</p>
                <p style="margin: 10px 0;"><strong>Transaction Hash:</strong> <code style="background: #f4f4f5; padding: 3px 6px; border-radius: 4px;">${hashId.trim()}</code></p>
                
                <div style="margin-top: 30px;">
                   <p><strong>Proof Attachment:</strong></p>
                   <a href="${imageUrl}" target="_blank">
                    <img src="${imageUrl}" style="width: 100%; max-width: 400px; border: 1px solid #ccc; border-radius: 4px;" />
                   </a>
                </div>
                
                <div style="margin-top: 30px; font-size: 12px; color: #777; border-top: 1px solid #eee; padding-top: 15px;">
                  This is a system notification for the Flyova Admin Panel.
                </div>
              </div>
            `
          })
        });
      } catch (emailErr) {
        console.error("Admin notification failed:", emailErr);
      }

      alert("Deposit Submitted! Please wait for admin confirmation.");
      router.push("/dashboard"); 
    } catch (error) {
      console.error("Submission Error:", error);
      alert(error.message || "Error submitting deposit. Please try again.");
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

        {!showProofForm ? (
          <div className="bg-[#1e293b] p-8 rounded-[2.5rem] border border-white/5 shadow-2xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-1 text-center">
              <p className="text-[10px] font-black text-gray-500 uppercase">Amount to Send</p>
              <p className="text-4xl font-black text-[#613de6] italic">${amount} <span className="text-sm">USDT</span></p>
            </div>

            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex gap-3">
              <AlertTriangle className="text-yellow-500 shrink-0" />
              <p className="text-[10px] font-bold text-yellow-200/80 leading-relaxed">
                ONLY send USDT via the <span className="text-yellow-500 font-black">TRC20 (Tron)</span> network. 
                Incorrect networks result in lost funds.
              </p>
            </div>

            <div className="flex flex-col items-center space-y-4 py-2">
              <div className="bg-white p-4 rounded-3xl shadow-xl shadow-black/20">
                <QRCode value={USDT_ADDRESS} size={160} level="H" style={{ height: "auto", maxWidth: "100%", width: "100%" }} />
              </div>
              <p className="text-[9px] font-black text-gray-500 uppercase flex items-center gap-2">
                 <QrCode size={12} /> Scan to copy address
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-black text-gray-500 uppercase ml-2">USDT TRC20 Address</p>
              <div className="bg-[#0f172a] p-4 rounded-2xl border border-white/5 flex items-center justify-between group active:scale-[0.98] transition-all">
                <span className="text-[10px] font-bold break-all mr-4 text-gray-300 group-hover:text-white">{USDT_ADDRESS}</span>
                <button onClick={copyToClipboard} className="p-3 bg-[#613de6] hover:bg-[#7251ed] rounded-xl shadow-lg transition-colors shrink-0">
                  <Copy size={16} />
                </button>
              </div>
            </div>

            <button 
              onClick={() => setShowProofForm(true)}
              className="w-full bg-[#fc7952] hover:bg-[#ff8a6a] py-5 rounded-3xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-[#fc7952]/20 active:scale-95 transition-all"
            >
              <CheckCircle size={18} /> I HAVE PAID
            </button>
          </div>
        ) : (
          <div className="bg-[#1e293b] p-8 rounded-[2.5rem] border border-white/5 shadow-2xl space-y-6 animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between">
              <h2 className="font-black uppercase italic text-sm tracking-tight text-[#fc7952]">Upload Payment Proof</h2>
              <button onClick={() => setShowProofForm(false)} className="text-gray-500"><X size={20}/></button>
            </div>

            <form onSubmit={handleSubmitDeposit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-500 ml-2">Transaction Hash (TXID)</label>
                <div className="relative">
                  <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-[#613de6]" size={16} />
                  <input 
                    required
                    value={hashId}
                    onChange={(e) => setHashId(e.target.value)}
                    placeholder="Enter 64-character hash"
                    className="w-full bg-[#0f172a] border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold focus:border-[#613de6] outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-500 ml-2">Payment Screenshot</label>
                <div 
                  onClick={() => fileInputRef.current.click()}
                  className="aspect-video bg-[#0f172a] border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:border-[#613de6] transition-all overflow-hidden relative"
                >
                  {preview ? (
                    <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <UploadCloud size={32} className="text-gray-600 mb-2" />
                      <p className="text-[10px] font-black text-gray-500 uppercase">Click to upload image</p>
                    </>
                  )}
                  <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/*" className="hidden" />
                </div>
              </div>

              <button 
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#613de6] hover:bg-[#7251ed] py-5 rounded-3xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-[#613de6]/20 active:scale-95 transition-all disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="animate-spin" /> : <CheckCircle size={18} />}
                SUBMIT
              </button>
            </form>
          </div>
        )}

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