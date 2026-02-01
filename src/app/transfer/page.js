"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import { 
  doc, 
  onSnapshot, 
  serverTimestamp, 
  collection, 
  query, 
  where, 
  getDocs, 
  writeBatch,
  increment,
  limit
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { 
  ChevronLeft, 
  Send, 
  Wallet, 
  User, 
  CheckCircle2, 
  Loader2, 
  Download,
  Receipt
} from "lucide-react";

export default function TransferPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState({ wallet: 0, pin: "", fullName: "" });
  
  const [recipientPin, setRecipientPin] = useState("");
  const [recipientData, setRecipientData] = useState(null);
  const [amount, setAmount] = useState("");
  const [searching, setSearching] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [transferRecord, setTransferRecord] = useState(null);

  // LOGIC FIX: Fee structure updated to match transfer.php
  const calculateTransferFee = (amt) => {
    const a = parseFloat(amt);
    if (!a || a <= 0) return 0;
    if (a >= 10001) return 50.00;
    if (a >= 5001)  return 30.00;
    if (a >= 2001)  return 25.00;
    if (a >= 1001)  return 18.00;
    if (a >= 851)   return 12.00;
    if (a >= 501)   return 10.00;
    if (a >= 251)   return 7.00;
    if (a >= 81)    return 5.00;
    if (a >= 51)    return 3.00;
    if (a >= 16)    return 2.00;
    if (a >= 1)     return 1.00;
    return 0.00;
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        onSnapshot(doc(db, "users", u.uid), (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setUserData({ 
              wallet: data.wallet || 0, 
              pin: data.pin || "",
              fullName: data.fullName || data.username || "User"
            });
          }
        });
      } else {
        router.push("/login");
      }
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (recipientPin.length === 8) {
      searchRecipient();
    } else {
      setRecipientData(null);
    }
  }, [recipientPin]);

  const searchRecipient = async () => {
    if (recipientPin === userData.pin) return; 
    setSearching(true);
    try {
      const q = query(collection(db, "users"), where("pin", "==", recipientPin), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const d = snap.docs[0].data();
        setRecipientData({ id: snap.docs[0].id, name: d.fullName || d.username });
      } else {
        setRecipientData(null);
      }
    } catch (e) { console.error(e); } finally { setSearching(false); }
  };

  const handleTransfer = async () => {
    const val = parseFloat(amount);
    const fee = calculateTransferFee(val);
    const totalDeduct = val + fee;

    if (!val || val < 1) return alert("Minimum transfer is $1.00");
    if (!recipientData) return alert("Please enter a valid recipient PIN");
    if (totalDeduct > userData.wallet) return alert(`Insufficient balance. You need $${totalDeduct.toFixed(2)} (Amount + Fee)`);

    setLoading(true);
    try {
      const batch = writeBatch(db);
      const senderRef = doc(db, "users", user.uid);
      const receiverRef = doc(db, "users", recipientData.id);
      
      batch.update(senderRef, { wallet: increment(-totalDeduct) });
      batch.update(receiverRef, { wallet: increment(val) });

      const txId = `TX-${Date.now()}`;
      const logData = {
        amount: val,
        fee: fee,
        senderId: user.uid,
        senderName: userData.fullName,
        receiverId: recipientData.id,
        receiverName: recipientData.name,
        type: "p2p_transfer",
        timestamp: serverTimestamp(),
        status: "completed",
        txId
      };

      const senderLogRef = doc(collection(db, "users", user.uid, "transactions"));
      const receiverLogRef = doc(collection(db, "users", recipientData.id, "transactions"));
      
      batch.set(senderLogRef, { ...logData, amount: -val, direction: "out" });
      batch.set(receiverLogRef, { ...logData, direction: "in" });

      await batch.commit();
      setTransferRecord(logData);
      setSuccess(true);
    } catch (e) {
      alert("Transfer failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6">
        <div id="receipt" className="bg-[#1e293b] w-full max-w-sm rounded-[3rem] p-8 border border-white/5 text-center shadow-2xl space-y-6">
          <div className="w-20 h-20 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto shadow-lg">
            <CheckCircle2 size={40} />
          </div>
          <div>
            <h2 className="text-2xl font-black uppercase italic">Transfer Successful</h2>
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] mt-2">Money Sent Successfully</p>
          </div>

          <div className="bg-black/20 rounded-3xl p-6 space-y-4 text-left">
             <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Recipient</span>
                <span className="text-sm font-black text-white italic">{transferRecord?.receiverName}</span>
             </div>
             <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Amount Sent</span>
                <span className="text-sm font-black text-[#fc7952] italic">${transferRecord?.amount.toFixed(2)}</span>
             </div>
             <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Service Fee</span>
                <span className="text-sm font-black text-rose-500 italic">${transferRecord?.fee.toFixed(2)}</span>
             </div>
             <div className="h-px bg-white/5 w-full" />
             <p className="text-[9px] font-bold text-gray-600 uppercase text-center tracking-tighter">Transaction ID: {transferRecord?.txId}</p>
          </div>

          <div className="space-y-3 no-print">
            <button onClick={() => window.print()} className="w-full bg-[#613de6] py-4 rounded-2xl font-black uppercase text-[10px] flex items-center justify-center gap-2 shadow-lg">
              <Download size={14} /> Download Receipt
            </button>
            <button onClick={() => router.push('/dashboard')} className="w-full py-4 rounded-2xl bg-white/5 text-white/50 font-black uppercase text-[10px]">
              Back to Dashboard
            </button>
          </div>
        </div>
        <style jsx global>{`
          @media print {
            .no-print { display: none !important; }
            body { background: white !important; }
            #receipt { border: none !important; box-shadow: none !important; color: black !important; }
          }
        `}</style>
      </div>
    );
  }

  const currentFee = calculateTransferFee(amount);
  const totalWithFee = (parseFloat(amount) || 0) + currentFee;

  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      <div className="p-6 pt-12 flex items-center justify-between bg-[#613de6] rounded-b-[2.5rem] shadow-xl">
        <button onClick={() => router.back()} className="p-2 bg-white/10 rounded-xl"><ChevronLeft size={20} /></button>
        <h1 className="font-black italic uppercase tracking-wider text-xs">P2P Transfer</h1>
        <div className="w-10" />
      </div>

      <div className="p-6 max-w-md mx-auto space-y-6 mt-4">
        <div className="bg-[#1e293b] p-6 rounded-[2.5rem] border border-white/5 flex justify-between items-center">
          <div>
            <p className="text-[10px] font-black opacity-40 uppercase mb-1 tracking-widest">Available to Send</p>
            <p className="text-3xl font-black italic text-[#613de6]">${userData.wallet.toLocaleString()}</p>
          </div>
          <Wallet size={24} className="text-[#fc7952]" />
        </div>

        <div className="space-y-4">
          <div className="bg-[#1e293b] p-6 rounded-[2rem] border border-white/5 relative">
            <label className="text-[10px] font-black uppercase opacity-40 block mb-3 tracking-widest">Recipient PIN (8 Digits)</label>
            <div className="flex items-center gap-3">
              <User size={20} className="text-gray-500" />
              <input 
                type="text" 
                maxLength={8}
                value={recipientPin}
                onChange={(e) => setRecipientPin(e.target.value)}
                placeholder="00000000"
                className="bg-transparent font-black text-2xl outline-none w-full tracking-widest placeholder:opacity-10" 
              />
              {searching && <Loader2 size={16} className="animate-spin text-[#613de6]" />}
            </div>

            {recipientData && (
               <div className="mt-4 flex items-center gap-2 bg-[#613de6]/10 p-3 rounded-2xl border border-[#613de6]/20 animate-in fade-in slide-in-from-top-2">
                 <CheckCircle2 size={14} className="text-green-500" />
                 <p className="text-[10px] font-black uppercase tracking-tight">RECIPIENT: <span className="text-white italic">{recipientData.name}</span></p>
               </div>
            )}
          </div>

          <div className="bg-[#1e293b] p-6 rounded-[2rem] border border-white/5">
            <label className="text-[10px] font-black uppercase opacity-40 block mb-2 tracking-widest">Amount to Transfer</label>
            <div className="flex items-baseline gap-1">
               <span className="text-2xl font-black opacity-20">$</span>
               <input 
                 type="number" 
                 value={amount} 
                 onChange={(e) => setAmount(e.target.value)}
                 placeholder="0.00"
                 className="w-full bg-transparent font-black text-4xl text-white outline-none" 
               />
            </div>
          </div>

          {parseFloat(amount) > 0 && (
            <div className="bg-black/20 border border-white/5 p-5 rounded-3xl space-y-2 animate-in fade-in slide-in-from-top-2">
               <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Service Fee</span>
                  <span className="text-[10px] font-black text-rose-500">+ ${currentFee.toFixed(2)}</span>
               </div>
               <div className="h-px bg-white/5 w-full" />
               <div className="flex justify-between items-center">
                  <span className="text-[11px] font-black text-white uppercase tracking-widest">Total Deductible</span>
                  <span className="text-lg font-black italic text-[#fc7952]">${totalWithFee.toFixed(2)}</span>
               </div>
            </div>
          )}

          <button 
            onClick={handleTransfer}
            disabled={loading || !recipientData || !amount}
            className="w-full bg-[#fc7952] py-6 rounded-[2rem] font-black italic uppercase flex items-center justify-center gap-3 shadow-2xl disabled:opacity-30 active:scale-95 transition-all text-white"
          >
            {loading ? <Loader2 className="animate-spin" /> : <>SEND NOW <Send size={20} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}