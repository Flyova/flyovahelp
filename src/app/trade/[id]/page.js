"use client";
import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import { 
  doc, onSnapshot, collection, addDoc, serverTimestamp, query, orderBy
} from "firebase/firestore";
import { authFetch } from "@/lib/authFetch";
import { formatLocal } from "@/lib/currency";
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
  // A clock for the agent's "Player didn't pay" button (15 minutes after accepting).
  const [nowMs, setNowMs] = useState(0);
  // The agent's country, for older trades that don't carry it (their total's currency).
  const [agentCountry, setAgentCountry] = useState("");
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const expiryTimerRef = useRef(null);
  const autoExpireBusyRef = useRef(false);

  const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dq9o866sc/image/upload";
  const UPLOAD_PRESET = "p_trade_proof"; 
  const API_KEY = "823961819667685";

  const expirePendingTrade = async () => {
    if (!id || autoExpireBusyRef.current) return;
    autoExpireBusyRef.current = true;
    try {
      // The server cancels it (refunding a withdrawal) only if it really is 15 minutes old.
      const res = await authFetch("/api/trades", { method: "POST", body: { action: "expire", id } });
      if (res.error) console.error("Auto-expire refund failed:", res.error);
    } finally {
      autoExpireBusyRef.current = false;
    }
  };

  useEffect(() => {
    if (!id) return;
    const unsubTrade = onSnapshot(doc(db, "trades", id), async (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() };
        setTrade(data);

        // The other side's records aren't readable: the player's name is on the
        // trade, and the server gives the player the agent's name and, once a
        // deposit is accepted, their bank details.
        const isAgent = auth.currentUser?.uid === data.agentId;
        if (isAgent) {
          setOtherPartyName(data.senderName || "Player");
          if (!data.country) {
            authFetch(`/api/trades?view=agent&id=${encodeURIComponent(snap.id)}`).then((info) => setAgentCountry(info.country || ""));
          }
        } else {
          const isApproved = data.status === "acknowledged" || data.status === "completed";
          const needBank = data.type === "deposit" && isApproved && !agentBank;
          const agentInfo = await authFetch(`/api/trades?view=agent&id=${encodeURIComponent(snap.id)}`);
          if (!agentInfo.error) {
            setOtherPartyName(agentInfo.name);
            setAgentCountry(agentInfo.country || "");
            if (needBank && agentInfo.bank) setAgentBank({ ...agentInfo.bank, full_name: agentInfo.name });
          }
        }

        if (expiryTimerRef.current) {
          clearInterval(expiryTimerRef.current);
          expiryTimerRef.current = null;
        }
        setTimeLeft(null);

        if (data.status === "pending" && data.createdAt?.toDate) {
          const startTime = data.createdAt.toDate().getTime();
          const expiryTime = startTime + (15 * 60 * 1000);

          const tick = () => {
            const now = Date.now();
            const diff = Math.max(0, Math.floor((expiryTime - now) / 1000));
            setTimeLeft(diff);

            if (diff <= 0) {
              if (expiryTimerRef.current) {
                clearInterval(expiryTimerRef.current);
                expiryTimerRef.current = null;
              }
              expirePendingTrade();
            }
          };

          tick();
          expiryTimerRef.current = setInterval(tick, 1000);
        }
      }
    });

    const q = query(collection(db, "trades", id, "messages"), orderBy("createdAt", "asc"));
    const unsubChat = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });

    return () => {
      if (expiryTimerRef.current) {
        clearInterval(expiryTimerRef.current);
        expiryTimerRef.current = null;
      }
      unsubTrade();
      unsubChat();
    };
  }, [id, agentBank]);

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000); // the 45-minute countdown shows seconds
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);

  /** markPaid (the money's been sent: the agent's on a withdrawal, the player's on a deposit) or notPaid (agent: never paid). */
  const tradeStep = async (action, question) => {
    if (!window.confirm(question)) return;
    setLoading(true);
    try {
      const res = await authFetch("/api/trades", { method: "POST", body: { action, id } });
      if (res.error) alert(res.error);
    } finally {
      setLoading(false);
    }
  };

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

    const confirmMsg = trade.type === "deposit" 
      ? `Accept trade? You'll be charged $${amount} + $${feeAmount.toFixed(2)} (3% admin fee).`
      : `Accept this withdrawal request for $${amount}? A 5% admin fee ($${feeAmount.toFixed(2)}) applies.`;

    if (!window.confirm(confirmMsg)) return;
    
    setLoading(true);
    try {
      // The server takes a deposit's amount + fee from your agent balance and emails the player.
      const res = await authFetch("/api/trades", { method: "POST", body: { action: "accept", id } });
      if (res.error) alert(res.error);
    } catch (e) { alert(e.message); } finally { setLoading(false); }
  };

  

  const handleFinalConfirm = async () => {
    if (!window.confirm("Confirm payment received?")) return;
    setLoading(true);
    try {
      // Deposit: the player's wallet gets the amount (and their referrer 2.5%).
      // Withdrawal: your agent balance gets the amount less 5%. The server emails the player.
      const res = await authFetch("/api/trades", { method: "POST", body: { action: "confirm", id } });
      if (res.error) alert("Error completing trade: " + res.error);
    } catch (e) { 
      console.error("!!! FINAL CONFIRM ERROR !!!", e);
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
  const acceptedMs = trade.acceptedAt?.toMillis?.() || 0;
  const unpaidWaitMin = acceptedMs && nowMs ? Math.max(0, Math.ceil((acceptedMs + 15 * 60 * 1000 - nowMs) / 60000)) : 15;
  const bank = trade.senderBank;
  const total = formatLocal(Number(trade.rate || 0) * Number(trade.amount || 0), trade.country || agentCountry);
  // The player has 45 minutes to confirm a withdrawal once the agent says they've paid.
  const paidMs = trade.agentPaidAt?.toMillis?.() || 0;
  const confirmLeft = paidMs && nowMs ? Math.max(0, paidMs + 45 * 60 * 1000 - nowMs) : null;
  const mmss = (msLeft) => `${Math.floor(msLeft / 60000)}:${String(Math.floor((msLeft % 60000) / 1000)).padStart(2, "0")}`;
  // Confirm only once the side sending the money says it has.
  const moneySent = trade.type === "deposit" ? !!trade.playerPaidAt : !!trade.agentPaidAt;

  return (
    <div className="min-h-screen bg-[#0B1220] flex flex-col text-white pb-48"> 
      <div className="bg-[#142036] p-6 pt-12 border-b border-white/5 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 hover:bg-white/5 rounded-full"><ArrowLeft size={20}/></button>
          <div>
            <h1 className="font-black uppercase italic tracking-tighter text-sm">
              Trade with {otherPartyName || "Loading..."}
            </h1>
            <p className="text-[10px] font-bold text-[#8B1E3F] uppercase tracking-widest">${Number(trade.amount).toLocaleString()}</p>
          </div>
        </div>
        <StatusBadge status={trade.status} />
      </div>

      {isAgent && (
        <div className="m-4 p-5 bg-[#2457D6]/10 rounded-3xl border border-[#2457D6]/20 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Receipt size={14} className="text-[#2457D6]" />
              <span className="text-[10px] font-black uppercase tracking-widest text-[#2457D6]">
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

      {/* --- BOTH PARTIES SEE THE SUMMARY --- */}
      {/* Scenario 1: For Normal User (Shows Summary + Bank Details) */}
      {!isAgent && (
        <div className="m-4 space-y-3">
            <div className="p-5 bg-[#142036] rounded-3xl border border-white/5 flex justify-between items-center">
                <div>
                    <p className="text-[9px] font-black uppercase opacity-40 mb-1">Trade Amount</p>
                    <p className="text-xl font-black italic text-[#2457D6]">${Number(trade.amount).toLocaleString()}</p>
                </div>
                <div className="text-right">
                    <p className="text-[9px] font-black uppercase opacity-40 mb-1">Total to {trade.type === "deposit" ? (isAgent ? "Receive" : "Pay") : (isAgent ? "Pay" : "Receive")}</p>
                    <p className="text-xl font-black italic text-[#8B1E3F]">{total}</p>
                    <p className="text-[9px] font-bold opacity-40 mt-1">${Number(trade.amount).toLocaleString()} × {Number(trade.rate || 0).toLocaleString()} per $1</p>
                </div>
            </div>

            {trade.type === "deposit" && agentBank && (trade.status === "acknowledged" || trade.status === "completed") && (
                <div className="p-5 bg-white text-slate-900 rounded-3xl shadow-2xl space-y-3 border-l-8 border-[#2457D6]">
                    <div className="flex justify-between items-start">
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Agent Bank Details</p>
                        < Landmark size={16} className="text-[#2457D6]" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-[11px] font-black uppercase tracking-tighter text-slate-500">{agentBank.bankName}</p>
                        <div className="flex items-center justify-between">
                            <p className="text-2xl font-black tracking-widest text-[#0B1220]">{agentBank.accountNumber}</p>
                            <button onClick={() => {navigator.clipboard.writeText(agentBank.accountNumber); alert("Copied!")}} className="p-2 bg-slate-100 rounded-lg active:scale-90"><Copy size={14}/></button>
                        </div>
                        <p className="text-xs font-bold text-slate-600 uppercase italic">
                           {agentBank.accountName || agentBank.full_name}
                        </p>
                    </div>
                </div>
            )}

            {trade.type === "deposit" && trade.status === "pending" && (
                <div className="p-5 bg-[#142036] rounded-3xl border border-white/5 text-center text-[11px] font-bold uppercase text-white/40 tracking-wider">
                    Waiting for agent to approve the trade. Bank details will appear here once approved.
                </div>
            )}

            {trade.type === "withdrawal" && trade.status === "acknowledged" && trade.agentPaidAt && (
                <div className="p-5 bg-emerald-500/10 rounded-3xl border border-emerald-500/30 text-[11px] font-bold text-emerald-300 leading-relaxed">
                    Your agent says they&apos;ve sent the money to {bank ? `${bank.bankName} ••••${String(bank.accountNumber).slice(-4)}` : "your bank"}. Check it and confirm below within 45 minutes; if it hasn&apos;t arrived, tell the agent here or contact support.
                    {confirmLeft !== null && (
                      <p className={`mt-3 flex items-center justify-center gap-2 text-sm font-black ${confirmLeft > 0 ? "text-white" : "text-rose-400"}`}>
                        <Clock size={14} /> {confirmLeft > 0 ? `${mmss(confirmLeft)} left to confirm` : "Time's up: confirm now"}
                      </p>
                    )}
                </div>
            )}

            {trade.type === "deposit" && trade.status === "acknowledged" && (
                trade.playerPaidAt ? (
                  <div className="p-4 bg-emerald-500/10 rounded-3xl border border-emerald-500/30 text-center text-[11px] font-bold text-emerald-300">
                    You said you&apos;ve sent {total}. The agent will confirm once it arrives.
                  </div>
                ) : (
                  <button onClick={() => tradeStep("markPaid", `Have you sent ${total} to ${agentBank?.bankName || "the agent's bank"}?`)} disabled={loading}
                    className="w-full bg-emerald-600 py-4 rounded-2xl font-black uppercase text-[11px] tracking-widest flex items-center justify-center gap-2 shadow-xl">
                    {loading ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />} I&apos;ve Sent the Money
                  </button>
                )
            )}
        </div>
      )}

      {/* Scenario 2: For Agent (Summary + the player's bank account) */}
      {isAgent && (
        <div className="m-4 space-y-3">
            {trade.type === "deposit" && trade.status === "acknowledged" && trade.playerPaidAt && (
                <div className="p-4 bg-emerald-500/10 rounded-3xl border border-emerald-500/30 text-[11px] font-bold text-emerald-300">
                    The player says they&apos;ve sent {total}. Check your bank, then confirm below.
                </div>
            )}
            {bank && (
                <div className="p-5 bg-white text-slate-900 rounded-3xl shadow-2xl space-y-1 border-l-8 border-emerald-500">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                      {trade.type === "withdrawal" ? "Pay the player to" : "The player pays from"}
                    </p>
                    <p className="text-[11px] font-black uppercase tracking-tighter text-slate-500">{bank.bankName}</p>
                    <div className="flex items-center justify-between">
                        <p className="text-2xl font-black tracking-widest text-[#0B1220]">{bank.accountNumber}</p>
                        <button onClick={() => {navigator.clipboard.writeText(bank.accountNumber); alert("Copied!")}} className="p-2 bg-slate-100 rounded-lg active:scale-90"><Copy size={14}/></button>
                    </div>
                    <p className="text-xs font-bold text-slate-600 uppercase italic">{bank.accountName}</p>
                </div>
            )}
            <div className="p-5 bg-[#142036] rounded-3xl border border-white/5 flex justify-between items-center">
                <div>
                    <p className="text-[9px] font-black uppercase opacity-40 mb-1">Trade Amount</p>
                    <p className="text-xl font-black italic text-[#2457D6]">${Number(trade.amount).toLocaleString()}</p>
                </div>
                <div className="text-right">
                    <p className="text-[9px] font-black uppercase opacity-40 mb-1">Total to {trade.type === "deposit" ? (isAgent ? "Receive" : "Pay") : (isAgent ? "Pay" : "Receive")}</p>
                    <p className="text-xl font-black italic text-[#8B1E3F]">{total}</p>
                    <p className="text-[9px] font-bold opacity-40 mt-1">${Number(trade.amount).toLocaleString()} × {Number(trade.rate || 0).toLocaleString()} per $1</p>
                </div>
            </div>
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

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-[#0B1220]/95 backdrop-blur-md border-t border-white/5 z-50 pb-20">
        {trade.status === 'pending' && isAgent && (
          <div className="flex gap-3 mb-4 max-w-md mx-auto">
            <button 
              onClick={async () => {
                if(window.confirm("Decline this trade?")) {
                  setLoading(true);
                  try {
                    // A withdrawal's amount goes back to the player; the server emails them.
                    const res = await authFetch("/api/trades", { method: "POST", body: { action: "decline", id } });
                    if (res.error) alert("Failed to decline trade: " + res.error);
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
                <button onClick={() => fileInputRef.current.click()} disabled={uploading} className="bg-[#142036] p-4 rounded-2xl text-[#2457D6] shadow-inner">
                  {uploading ? <Loader2 className="animate-spin" size={20} /> : <ImageIcon size={20} />}
                </button>
                <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder="Type a message..." className="flex-1 bg-[#142036] border border-white/10 p-4 rounded-2xl outline-none focus:border-[#2457D6] text-sm font-bold text-white placeholder:text-slate-500 shadow-inner" />
                <button onClick={() => sendMessage()} className="bg-[#2457D6] p-4 rounded-2xl shadow-lg active:scale-95 transition-all"><Send size={20} /></button>
             </div>
        )}

        {trade.status === 'acknowledged' && isAgent && trade.type === "withdrawal" && (
             trade.agentPaidAt ? (
               <p className="max-w-md mx-auto w-full mb-4 text-center text-[10px] font-black uppercase tracking-widest text-emerald-400">
                 You said it&apos;s paid. Waiting for the player to confirm.
               </p>
             ) : (
               <button onClick={() => tradeStep("markPaid", `Have you sent ${total} to the player's bank?`)} disabled={loading}
                 className="max-w-md mx-auto w-full mb-4 bg-emerald-600 py-5 rounded-2xl font-black uppercase text-[11px] tracking-widest flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all">
                 {loading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />} I&apos;VE SENT THE MONEY
               </button>
             )
        )}

        {trade.status === 'acknowledged' && isAgent && trade.type === "deposit" && (
             <button onClick={() => tradeStep("notPaid", "Cancel this deposit because the player didn't pay? Your balance comes back, and it counts against the player.")} disabled={loading || unpaidWaitMin > 0}
               className="max-w-md mx-auto w-full mb-3 bg-rose-500/10 text-rose-400 border border-rose-500/20 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 disabled:opacity-40">
               <XCircle size={14} /> {unpaidWaitMin > 0 ? `Player didn't pay (in ${unpaidWaitMin} min)` : "Player didn't pay"}
             </button>
        )}

        {trade.status === 'acknowledged' && canConfirm && (
             <button onClick={handleFinalConfirm} disabled={loading || !moneySent} className="max-w-md mx-auto w-full bg-green-600 py-5 rounded-2xl font-black uppercase text-[11px] tracking-widest flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100">
                {loading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                {moneySent ? "CONFIRM PAYMENT RECEIVED" : trade.type === "deposit" ? "WAITING FOR THE PLAYER TO PAY" : "WAITING FOR THE AGENT TO PAY"}
             </button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
    const colors = { 
        pending: "bg-orange-500/20 text-orange-400", 
        acknowledged: "bg-[#2457D6]/20 text-[#7A9BEE]", 
        completed: "bg-green-500/20 text-green-400", 
        cancelled: "bg-rose-500/20 text-rose-400" 
    };
    return <div className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-tighter ${colors[status]}`}>{status}</div>;
}

function MessageBubble({ msg, isMe }) {
    return (
        <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
            <div className={`max-w-[80%] p-4 rounded-2xl text-[13px] font-bold ${isMe ? 'bg-[#2457D6] text-white rounded-tr-none shadow-lg' : 'bg-[#142036] text-slate-100 rounded-tl-none border border-white/10 shadow-inner'}`}>
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
