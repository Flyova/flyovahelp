"use client";
import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import { 
  doc, onSnapshot, updateDoc, increment, 
  collection, addDoc, serverTimestamp, query, orderBy, writeBatch, getDoc, where, getDocs, limit 
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
    // Apply Fix: 3% for Deposit, 5% for Withdrawal
    const feePercent = trade.type === "deposit" ? 0.03 : 0.05;
    const feeAmount = amount * feePercent;
    const totalRequired = amount + feeAmount;

    const confirmMsg = trade.type === "deposit" 
      ? `Accept trade? You'll be charged $${amount} + $${feeAmount.toFixed(2)} (3% admin fee).`
      : `Accept this withdrawal request for $${amount}? A 5% admin fee ($${feeAmount.toFixed(2)}) applies.`;

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
      } 

      batch.update(doc(db, "trades", id), { 
        status: "acknowledged", 
        acceptedAt: serverTimestamp(),
        fee: feeAmount, // Update actual fee in trade doc
        feeCharged: feeAmount,
        agentImpact: trade.type === "deposit" ? -totalRequired : 0 
      });

      await batch.commit();

      // TRIGGER: NOTIFY USER OF ACCEPTANCE
      try {
        const userSnap = await getDoc(doc(db, "users", trade.senderId));
        if (userSnap.exists()) {
          await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: userSnap.data().email,
              subject: "Trade Request Accepted",
              html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; border: 1px solid #ddd; border-radius: 8px;">
                  <h2 style="color: #613de6; border-bottom: 1px solid #eee; padding-bottom: 10px;">Agent Accepted Trade</h2>
                  <p>Hello,</p>
                  <p>The agent has accepted your ${trade.type} request for $${trade.amount}.</p>
                  <p>${trade.type === 'deposit' 
                    ? "Please return to the Trade Room to view the agent's bank details and make your payment." 
                    : "The agent is now processing your payout. Please check the trade chat for payment confirmation."}</p>
                  <div style="margin-top: 30px; font-size: 11px; color: #777; border-top: 1px solid #eee; padding-top: 15px;">Flyova Global Network</div>
                </div>
              `
            })
          });
        }
      } catch (emailErr) { console.error("Acceptance email failed:", emailErr); }

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
      
      // Re-calculate fee based on type for final transaction
      const feePercent = trade.type === "deposit" ? 0.03 : 0.05;
      const feeAmount = amount * feePercent;

      if (trade.type === "deposit") {
        batch.update(userRef, { wallet: increment(amount) });
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          if (userData.referredBy) {
            const rewardAmount = amount * 0.015; 
            const referrerRef = doc(db, "users", userData.referredBy);
            batch.update(referrerRef, { referralBonus: increment(rewardAmount) });
            const rewardLogRef = collection(db, "users", userData.referredBy, "transactions");
            await addDoc(rewardLogRef, {
              amount: rewardAmount,
              type: "referral_reward",
              status: "completed",
              description: `1.5% commission from @${userData.username}'s deposit`,
              createdAt: serverTimestamp(),
              fromUser: userData.username
            });
          }
        }
      } else {
        // Withdrawal: Agent gets Amount MINUS 5% fee
        const netToAgent = amount - feeAmount;
        batch.update(agentRef, { agent_balance: increment(netToAgent) });
        const transQ = query(
          collection(db, "users", trade.senderId, "transactions"), 
          where("tradeId", "==", id),
          limit(1)
        );
        const transSnap = await getDocs(transQ);
        if (!transSnap.empty) {
          batch.update(transSnap.docs[0].ref, { status: "completed" });
        }
      }

      batch.update(doc(db, "trades", id), { 
        status: "completed", 
        completedAt: serverTimestamp(),
        finalFee: feeAmount
      });
      
      await batch.commit();

      // TRIGGER: NOTIFY USER OF COMPLETION
      try {
        const userSnap = await getDoc(doc(db, "users", trade.senderId));
        if (userSnap.exists()) {
          await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: userSnap.data().email,
              subject: "Trade Successfully Completed",
              html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; border: 1px solid #ddd; border-radius: 8px;">
                  <h2 style="color: #10b981; border-bottom: 1px solid #eee; padding-bottom: 10px;">Transaction Success</h2>
                  <p>Hello,</p>
                  <p>Your ${trade.type} of $${trade.amount} has been successfully verified and completed.</p>
                  <p>${trade.type === 'deposit' 
                    ? "The funds have been credited to your Flyova wallet." 
                    : "The funds have been sent to your provided account details."}</p>
                  <div style="margin-top: 30px; font-size: 11px; color: #777; border-top: 1px solid #eee; padding-top: 15px;">Flyova Global Network</div>
                </div>
              `
            })
          });
        }
      } catch (e) { console.error("Completion email failed", e); }

    } catch (e) { 
      console.error(e);
      alert("Error completing trade: " + e.message); 
    } finally { 
      setLoading(false); 
    }
  };

  if (!trade) return null;

  const isAgent = auth.currentUser?.uid === trade.agentId;
  const canConfirm = (trade.type === "deposit" && isAgent) || (trade.type === "withdrawal" && !isAgent);
  
  // Update Display Fee for Agent Summary
  const currentFeePercent = trade.type === "deposit" ? 0.03 : 0.05;
  const calculatedFee = Number(trade.amount) * currentFeePercent;

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
                Agent {trade.type === "deposit" ? "Deduction" : "Earnings"} Summary ({currentFeePercent * 100}%)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-y-2">
              <span className="text-[10px] font-bold opacity-50 uppercase">Trade Amount:</span>
              <span className="text-[10px] font-black text-right">${Number(trade.amount).toFixed(2)}</span>
              <span className="text-[10px] font-bold opacity-50 uppercase">Admin Fee:</span>
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
            <button 
              onClick={async () => {
                if(window.confirm("Decline this trade?")) {
                  setLoading(true);
                  try {
                    const batch = writeBatch(db);

                    // REFUND LOGIC: If it's a withdrawal, return Trade Amount + 5% Fee to User Wallet
                    if (trade.type === "withdrawal") {
                      const refundTotal = Number(trade.amount) + (Number(trade.amount) * 0.05);
                      const userRef = doc(db, "users", trade.senderId);
                      batch.update(userRef, { wallet: increment(refundTotal) });

                      const transQ = query(
                        collection(db, "users", trade.senderId, "transactions"), 
                        where("tradeId", "==", id),
                        limit(1)
                      );
                      const transSnap = await getDocs(transQ);
                      if (!transSnap.empty) {
                        batch.update(transSnap.docs[0].ref, { 
                          status: "cancelled", 
                          description: "Withdrawal Declined - Balance Refunded" 
                        });
                      }
                    }

                    batch.update(doc(db, "trades", id), { 
                      status: "cancelled", 
                      cancelledAt: serverTimestamp(),
                      declineReason: "Agent Declined" 
                    });
                    
                    await batch.commit();

                    try {
                      const userSnap = await getDoc(doc(db, "users", trade.senderId));
                      if (userSnap.exists()) {
                        await fetch('/api/send-email', {
                          method: 'POST', 
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            to: userSnap.data().email,
                            subject: "Trade Request Declined",
                            html: `
                              <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; border: 1px solid #ddd; border-radius: 8px;">
                                <h2 style="color: #e11d48; border-bottom: 1px solid #eee; padding-bottom: 10px;">Request Declined</h2>
                                <p>Hello,</p>
                                <p>Your ${trade.type} request for $${trade.amount} has been declined by the agent.</p>
                                <p>${trade.type === 'withdrawal' 
                                  ? "The full amount including fees has been refunded to your wallet balance." 
                                  : "This transaction has been cancelled. No funds were charged."}</p>
                                <div style="margin-top: 30px; font-size: 11px; color: #777; border-top: 1px solid #eee; padding-top: 15px;">Flyova Global Network</div>
                              </div>
                            `
                          })
                        });
                      }
                    } catch (e) { console.error("Decline email failed", e); }
                  } catch (err) {
                    alert("Failed to decline trade: " + err.message);
                  } finally {
                    setLoading(false);
                  }
                }
              }} 
              disabled={loading}
              className="flex-1 bg-rose-500/10 text-rose-500 py-4 rounded-2xl font-black uppercase text-[10px] border border-rose-500/20 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" size={14} /> : "Decline"}
            </button>
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