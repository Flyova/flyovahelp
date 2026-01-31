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
  CheckCircle2, Loader2, MessageSquare, Info, Paperclip, ImageIcon, Clock, XCircle, ArrowLeft, Receipt, Copy
} from "lucide-react";

export default function TradeRoom() {
  const { id } = useParams();
  const router = useRouter();
  const [trade, setTrade] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [agentBank, setAgentBank] = useState(null);
  const [otherPartyName, setOtherPartyName] = useState("");
  const [timeLeft, setTimeLeft] = useState(null);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dq9o866sc/image/upload";
  const UPLOAD_PRESET = "p_trade_proof"; 
  const API_KEY = "823961819667685";

  useEffect(() => {
    if (!id) return;
    const unsubTrade = onSnapshot(doc(db, "trades", id), async (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() };
        setTrade(data);

        const isAgent = auth.currentUser?.uid === data.agentId;
        const otherPartyId = isAgent ? data.senderId : data.agentId;
        const otherPartyCollection = isAgent ? "users" : "agents";
        
        const partySnap = await getDoc(doc(db, otherPartyCollection, otherPartyId));
        if (partySnap.exists()) {
            const pData = partySnap.data();
            setOtherPartyName(pData.full_name || pData.fullName || (isAgent ? data.senderName : data.agentName));
        }

        if (data.type === "deposit" && !isAgent && !agentBank) {
            const agentSnap = await getDoc(doc(db, "agents", data.agentId));
            if (agentSnap.exists()) {
                setAgentBank(agentSnap.data());
            }
        }
        
        if (data.status === 'pending' && data.createdAt) {
          const startTime = data.createdAt.toDate().getTime();
          const expiryTime = startTime + (15 * 60 * 1000); 
          const timer = setInterval(() => {
            const now = new Date().getTime();
            const diff = Math.max(0, Math.floor((expiryTime - now) / 1000));
            setTimeLeft(diff);
            if (diff <= 0) {
              clearInterval(timer);
              updateDoc(doc(db, "trades", id), { status: "cancelled", reason: "Expired" });
            }
          }, 1000);
          return () => clearInterval(timer);
        }
      }
    });

    const q = query(collection(db, "trades", id, "messages"), orderBy("createdAt", "asc"));
    const unsubChat = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });

    return () => { unsubTrade(); unsubChat(); };
  }, [id, agentBank]);

  const sendMessage = async (imageUrl = null) => {
    if (!newMessage.trim() && !imageUrl) return;
    const textToSend = newMessage;
    setNewMessage(""); 
    try {
        await addDoc(collection(db, "trades", id, "messages"), {
            text: imageUrl ? "" : textToSend,
            image: imageUrl || null,
            senderId: auth.currentUser.uid,
            createdAt: serverTimestamp(),
            type: imageUrl ? "image" : "text"
        });
    } catch (e) { console.error(e); }
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

  const handleAcceptTrade = async () => {
    const amount = Number(trade.amount);
    const feePercent = trade.type === "deposit" ? 0.03 : 0.05;
    const feeAmount = amount * feePercent;
    const totalRequired = amount + feeAmount;

    // Updated Logic: Only inform Agent of charge if it's a Deposit.
    // For Withdrawals, they are just acknowledging the user's request.
    const confirmMsg = trade.type === "deposit" 
      ? `Accept trade? You'll be charged $${amount} + $${feeAmount.toFixed(2)} admin fee.`
      : `Accept this withdrawal request for $${amount}?`;

    if (!window.confirm(confirmMsg)) return;
    
    setLoading(true);
    try {
      const batch = writeBatch(db);
      
      if (trade.type === "deposit") {
        const agentRef = doc(db, "agents", auth.currentUser.uid);
        const agentSnap = await getDoc(agentRef);
        if ((agentSnap.data().agent_balance || 0) < totalRequired) {
          alert(`Insufficient Agent Balance! Need $${totalRequired.toFixed(2)}`);
          setLoading(false);
          return;
        }
        batch.update(agentRef, { agent_balance: increment(-totalRequired) });
      } else {
        // WITHDRAWAL: Debit the User's wallet (amount + fee) to hold it in escrow
        const userRef = doc(db, "users", trade.senderId);
        const userSnap = await getDoc(userRef);
        if ((userSnap.data().wallet || 0) < totalRequired) {
          alert(`The user has insufficient funds in their wallet for this withdrawal.`);
          setLoading(false);
          return;
        }
        batch.update(userRef, { wallet: increment(-totalRequired) });
      }

      batch.update(doc(db, "trades", id), { 
        status: "acknowledged", 
        acceptedAt: serverTimestamp(),
        feeCharged: feeAmount,
        // Impact track: Deposits remove money from Agent, Withdrawals will eventually add (amount - fee)
        agentImpact: trade.type === "deposit" ? -totalRequired : 0 
      });

      await batch.commit();
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  };

  const handleFinalConfirm = async () => {
    if (!window.confirm("Confirm payment received?")) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const userRef = doc(db, "users", trade.senderId);
      const agentRef = doc(db, "agents", trade.agentId);
      const amount = Number(trade.amount);
      const feePercent = trade.type === "deposit" ? 0.03 : 0.05;
      const feeAmount = amount * feePercent;

      if (trade.type === "deposit") {
        // Deposit: User gets the net amount credited to their wallet
        batch.update(userRef, { wallet: increment(amount) });
      } else {
        // Withdrawal: Agent gets the net amount (amount - fee) credited to their agent balance
        const netToAgent = amount - feeAmount;
        batch.update(agentRef, { agent_balance: increment(netToAgent) });
      }

      batch.update(doc(db, "trades", id), { 
        status: "completed", 
        completedAt: serverTimestamp() 
      });
      
      await batch.commit();
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  };

  if (!trade) return null;

  const isAgent = auth.currentUser?.uid === trade.agentId;
  const canConfirm = (trade.type === "deposit" && isAgent) || (trade.type === "withdrawal" && !isAgent);
  const feePercent = trade.type === "deposit" ? 0.03 : 0.05;
  const calculatedFee = Number(trade.amount) * feePercent;

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col text-white pb-48"> 
      <div className="bg-[#1e293b] p-6 pt-12 border-b border-white/5 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-white/5 rounded-full"><ArrowLeft size={20}/></button>
          <div>
            <h1 className="font-black uppercase italic tracking-tighter text-sm">
              Trade with {otherPartyName || "Loading..."}
            </h1>
            <p className="text-[10px] font-bold text-[#fc7952] uppercase tracking-widest">${Number(trade.amount).toLocaleString()}</p>
          </div>
        </div>
        <StatusBadge status={trade.status} />
      </div>

      {isAgent && (
        <div className="m-4 p-5 bg-[#613de6]/10 rounded-3xl border border-[#613de6]/20 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Receipt size={14} className="text-[#613de6]" />
              <span className="text-[10px] font-black uppercase tracking-widest text-[#613de6]">
                Agent {trade.type === "deposit" ? "Deduction" : "Earnings"} Summary
              </span>
            </div>
            <div className="grid grid-cols-2 gap-y-2">
              <span className="text-[10px] font-bold opacity-50 uppercase">Trade Amount:</span>
              <span className="text-[10px] font-black text-right">${Number(trade.amount).toFixed(2)}</span>
              <span className="text-[10px] font-bold opacity-50 uppercase">Admin Fee ({feePercent * 100}%):</span>
              <span className="text-[10px] font-black text-right text-rose-400">-${calculatedFee.toFixed(2)}</span>
              <div className="col-span-2 h-px bg-white/5 my-1" />
              <span className="text-[11px] font-black uppercase">
                {trade.type === "deposit" ? "Total Deduction:" : "Net to Agent Balance:"}
              </span>
              <span className={`text-[11px] font-black text-right ${trade.type === "deposit" ? 'text-rose-400' : 'text-emerald-400'}`}>
                ${trade.type === "deposit" 
                  ? (Number(trade.amount) + calculatedFee).toFixed(2) 
                  : (Number(trade.amount) - calculatedFee).toFixed(2)}
              </span>
            </div>
        </div>
      )}

      {!isAgent && (
        <div className="m-4 space-y-3">
            <div className="p-5 bg-[#1e293b] rounded-3xl border border-white/5 flex justify-between items-center">
                <div>
                    <p className="text-[9px] font-black uppercase opacity-40 mb-1">Trade Amount</p>
                    <p className="text-xl font-black italic text-[#613de6]">${Number(trade.amount).toLocaleString()}</p>
                </div>
                <div className="text-right">
                    <p className="text-[9px] font-black uppercase opacity-40 mb-1">Total to Pay/Receive</p>
                    <p className="text-xl font-black italic text-[#fc7952]">{(trade.rate * trade.amount).toLocaleString()}</p>
                </div>
            </div>

            {trade.type === "deposit" && agentBank && (
                <div className="p-5 bg-white text-slate-900 rounded-3xl shadow-2xl space-y-3 border-l-8 border-[#613de6]">
                    <div className="flex justify-between items-start">
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Agent Bank Details</p>
                        < Landmark size={16} className="text-[#613de6]" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-[11px] font-black uppercase tracking-tighter text-slate-500">{agentBank.bankName}</p>
                        <div className="flex items-center justify-between">
                            <p className="text-2xl font-black tracking-widest text-[#0f172a]">{agentBank.accountNumber}</p>
                            <button onClick={() => {navigator.clipboard.writeText(agentBank.accountNumber); alert("Copied!")}} className="p-2 bg-slate-100 rounded-lg active:scale-90"><Copy size={14}/></button>
                        </div>
                        <p className="text-xs font-bold text-slate-600 uppercase italic">
                           {agentBank.accountName || agentBank.full_name}
                        </p>
                    </div>
                </div>
            )}
        </div>
      )}

      {trade.status === 'pending' && timeLeft !== null && (
          <div className="mx-4 mb-4 flex items-center justify-center gap-2 bg-orange-500/10 py-3 rounded-2xl text-orange-500 font-black text-[10px] uppercase border border-orange-500/10">
              <Clock size={12} /> Expires In: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
          </div>
      )}

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg) => (
           <MessageBubble key={msg.id} msg={msg} isMe={msg.senderId === auth.currentUser.uid} />
        ))}
        <div ref={scrollRef} />
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-[#0f172a]/95 backdrop-blur-md border-t border-white/5 z-50 pb-20">
        {trade.status === 'pending' && isAgent && (
          <div className="flex gap-3 mb-4 max-w-md mx-auto">
            <button onClick={() => updateDoc(doc(db, "trades", id), { status: "cancelled" })} className="flex-1 bg-rose-500/10 text-rose-500 py-4 rounded-2xl font-black uppercase text-[10px] border border-rose-500/20">Decline</button>
            <button onClick={handleAcceptTrade} disabled={loading} className="flex-[2] bg-emerald-500 text-white py-4 rounded-2xl font-black uppercase text-[10px] flex items-center justify-center gap-2 shadow-lg">
                {loading ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />} Accept Trade
            </button>
          </div>
        )}

        {trade.status !== 'completed' && trade.status !== 'cancelled' && (
             <div className="flex gap-2 max-w-md mx-auto w-full mb-4 items-center">
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
                <button onClick={() => fileInputRef.current.click()} disabled={uploading} className="bg-[#1e293b] p-4 rounded-2xl text-[#613de6] shadow-inner">
                  {uploading ? <Loader2 className="animate-spin" size={20} /> : <ImageIcon size={20} />}
                </button>
                <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder="Type a message..." className="flex-1 bg-[#1e293b] border border-white/5 p-4 rounded-2xl outline-none focus:border-[#613de6] text-sm font-bold shadow-inner" />
                <button onClick={() => sendMessage()} className="bg-[#613de6] p-4 rounded-2xl shadow-lg active:scale-95 transition-all"><Send size={20} /></button>
             </div>
        )}

        {trade.status === 'acknowledged' && canConfirm && (
             <button onClick={handleFinalConfirm} disabled={loading} className="max-w-md mx-auto w-full bg-green-600 py-5 rounded-2xl font-black uppercase text-[11px] tracking-widest flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all">
                {loading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />} CONFIRM PAYMENT RECEIVED
             </button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
    const colors = { 
        pending: "bg-orange-500/20 text-orange-400", 
        acknowledged: "bg-blue-500/20 text-blue-400", 
        completed: "bg-green-500/20 text-green-400", 
        cancelled: "bg-rose-500/20 text-rose-400" 
    };
    return <div className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-tighter ${colors[status]}`}>{status}</div>;
}

function MessageBubble({ msg, isMe }) {
    return (
        <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
            <div className={`max-w-[80%] p-4 rounded-2xl text-[13px] font-bold ${isMe ? 'bg-[#613de6] text-white rounded-tr-none shadow-lg' : 'bg-[#1e293b] text-gray-300 rounded-tl-none border border-white/5 shadow-inner'}`}>
                {msg.image ? (
                  <div className="space-y-2">
                    <img src={msg.image} alt="Proof" className="max-w-full rounded-lg cursor-pointer" onClick={() => window.open(msg.image, '_blank')} />
                    <p className="text-[8px] font-black uppercase opacity-50 flex items-center gap-1"><ImageIcon size={10}/> Payment Proof</p>
                  </div>
                ) : (
                  msg.text
                )}
            </div>
        </div>
    );
}