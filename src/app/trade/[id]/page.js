"use client";
import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import { 
  doc, onSnapshot, updateDoc, increment, 
  collection, addDoc, serverTimestamp, query, orderBy, writeBatch, getDoc 
} from "firebase/firestore";
import { 
  Send, ShieldCheck, Landmark, AlertCircle, 
  CheckCircle2, Loader2, MessageSquare, Info, Paperclip, ImageIcon 
} from "lucide-react";

export default function TradeRoom() {
  const { id } = useParams();
  const router = useRouter();
  const [trade, setTrade] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dq9o866sc/image/upload";
  const UPLOAD_PRESET = "p_trade_proof"; 
  const API_KEY = "823961819667685";

  useEffect(() => {
    if (!id) return;
    const unsubTrade = onSnapshot(doc(db, "trades", id), (snap) => {
      if (snap.exists()) setTrade({ id: snap.id, ...snap.data() });
    });
    const q = query(collection(db, "trades", id, "messages"), orderBy("createdAt", "asc"));
    const unsubChat = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });
    return () => { unsubTrade(); unsubChat(); };
  }, [id]);

  const sendMessage = async (imageUrl = null) => {
    if (!newMessage.trim() && !imageUrl) return;
    const textToSend = newMessage;
    setNewMessage(""); 
    await addDoc(collection(db, "trades", id, "messages"), {
      text: imageUrl ? "" : textToSend,
      image: imageUrl || null,
      senderId: auth.currentUser.uid,
      createdAt: serverTimestamp(),
    });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);
    formData.append("api_key", API_KEY);
    try {
      const res = await fetch(CLOUDINARY_URL, { method: "POST", body: formData });
      const data = await res.json();
      if (data.secure_url) await sendMessage(data.secure_url);
    } catch (err) {
      alert("Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFinalConfirm = async () => {
    if (!window.confirm("Confirm funds received? Money will move immediately!")) return;
    setLoading(true);

    try {
      const batch = writeBatch(db);
      const tradeRef = doc(db, "trades", id);
      const userRef = doc(db, "users", trade.senderId);
      const agentRef = doc(db, "users", trade.agentId);
      const amount = Number(trade.amount);

      // --- BALANCE CHECK LOGIC ---
      // Determine who is paying the USDT
      const payerRef = trade.type === "deposit" ? agentRef : userRef;
      const payerSnap = await getDoc(payerRef);
      
      if (!payerSnap.exists()) throw new Error("Payer account not found.");
      
      const currentBalance = payerSnap.data().wallet || 0;

      if (currentBalance < amount) {
        alert(`Insufficient Wallet Balance! Required: $${amount}, Available: $${currentBalance}`);
        setLoading(false);
        return; // STOP the transaction
      }
      // --- END BALANCE CHECK ---

      if (trade.type === "deposit") {
        batch.update(agentRef, { wallet: increment(-amount) });
        batch.update(userRef, { wallet: increment(amount) });
      } else {
        batch.update(userRef, { wallet: increment(-amount) });
        batch.update(agentRef, { wallet: increment(amount) });
      }

      batch.update(tradeRef, { status: "completed", completedAt: serverTimestamp() });

      await batch.commit();
      alert("Trade Completed Successfully!");
    } catch (e) {
      console.error(e);
      alert("Error finalizing trade: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!trade) return <div className="min-h-screen bg-[#0f172a] flex items-center justify-center"><Loader2 className="animate-spin text-[#613de6]" /></div>;

  const isAgent = auth.currentUser?.uid === trade.agentId;
  const canConfirm = (trade.type === "deposit" && isAgent) || (trade.type === "withdrawal" && !isAgent);

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col text-white pb-28"> 
      <div className="bg-[#1e293b] p-6 pt-12 border-b border-white/5 flex items-center justify-between shadow-xl sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#613de6] rounded-2xl flex items-center justify-center font-black italic shadow-lg">
            {trade.type === 'deposit' ? 'DP' : 'WD'}
          </div>
          <div>
            <h1 className="font-black uppercase italic tracking-tighter text-sm">
              {trade.type === 'deposit' ? 'Purchase USDT' : 'Sell USDT'}
            </h1>
            <p className="text-[10px] font-bold text-[#fc7952] uppercase tracking-widest">${trade.amount.toLocaleString()}</p>
          </div>
        </div>
        <div className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase ${trade.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400 animate-pulse'}`}>
          {trade.status}
        </div>
      </div>

      <div className="p-4 bg-[#613de6]/10 border-b border-[#613de6]/20">
        <div className="flex gap-3 mb-2">
            <Info className="text-[#613de6] shrink-0" size={16} />
            <p className="text-[10px] font-black uppercase text-white tracking-tight">Trade Steps:</p>
        </div>
        <p className="text-[11px] font-bold text-gray-400 leading-relaxed pl-7">
          {trade.type === 'deposit' 
            ? (isAgent ? "Send your bank details. Wait for the user to upload payment proof." : "Transfer money to the agent's bank and UPLOAD the screenshot proof.")
            : (isAgent ? "Wait for user's bank details, pay them, and UPLOAD the payment receipt." : "Send your bank details and wait for the agent to upload payment proof.")
          }
        </p>
      </div>

      <div className="pb-50 flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar min-h-[300px]">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.senderId === auth.currentUser.uid ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-3xl overflow-hidden shadow-2xl ${
              msg.senderId === auth.currentUser.uid 
              ? 'bg-[#613de6] text-white rounded-tr-none' 
              : 'bg-[#1e293b] text-gray-300 rounded-tl-none border border-white/5'
            }`}>
              {msg.image ? (
                <div className="p-1 group relative">
                  <img src={msg.image} className="w-full max-h-72 object-cover rounded-2xl cursor-pointer" onClick={() => window.open(msg.image, '_blank')} />
                  <div className="p-2 flex items-center gap-2">
                    <ImageIcon size={12} className="text-white/50" />
                    <span className="text-[8px] font-black uppercase tracking-widest opacity-60">Payment Proof</span>
                  </div>
                </div>
              ) : (
                <div className="p-4 text-sm font-bold leading-relaxed">{msg.text}</div>
              )}
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      <div className="p-6 bg-[#0f172a]/95 backdrop-blur-md border-t border-white/5 space-y-4 fixed bottom-24 left-0 right-0 z-40">
        {trade.status === 'pending' && (
          <div className="flex gap-2 max-w-md mx-auto w-full">
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
            <button disabled={uploading} onClick={() => fileInputRef.current.click()} className="bg-[#1e293b] p-4 rounded-2xl border border-white/5 text-[#613de6] active:scale-90 transition-all shadow-lg min-w-[56px]">
              {uploading ? <Loader2 className="animate-spin" size={20} /> : <Paperclip size={20} />}
            </button>
            <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder="Message..." className="flex-1 bg-[#1e293b] border border-white/5 p-4 rounded-2xl outline-none focus:border-[#613de6] text-sm font-bold shadow-inner" />
            <button onClick={() => sendMessage()} className="bg-[#613de6] p-4 rounded-2xl active:scale-90 shadow-lg shadow-[#613de6]/20"><Send size={20} /></button>
          </div>
        )}

        {trade.status === 'pending' && canConfirm && (
          <div className="max-w-md mx-auto w-full">
            <button onClick={handleFinalConfirm} disabled={loading} className="w-full bg-green-600 py-5 rounded-2xl font-black uppercase text-[11px] tracking-widest flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all">
                {loading ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={18} />}
                CONFIRM PAYMENT RECEIVED
            </button>
          </div>
        )}

        {trade.status === 'completed' && (
          <div className="max-w-md mx-auto w-full bg-green-500/10 p-5 rounded-2xl border border-green-500/20 text-center animate-in zoom-in duration-300">
             <p className="text-green-500 font-black uppercase text-[10px] italic flex items-center justify-center gap-2">
                <CheckCircle2 size={14} /> Trade Completed Successfully
             </p>
          </div>
        )}
      </div>
    </div>
  );
}