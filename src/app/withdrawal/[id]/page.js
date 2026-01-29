"use client";
import { useState, useEffect, useRef } from "react";
import { db, auth, storage } from "@/lib/firebase";
import { doc, onSnapshot, collection, addDoc, serverTimestamp, query, orderBy, updateDoc, getDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useParams, useRouter } from "next/navigation";
import { Send, Image, CheckCircle, AlertCircle, ChevronLeft, Loader2, Landmark } from "lucide-react";

export default function TradeChatPage() {
  const { id } = useParams();
  const router = useRouter();
  const scrollRef = useRef(null);
  
  const [trade, setTrade] = useState(null);
  const [agentData, setAgentData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged((u) => {
      if (u) setUser(u);
      else router.push("/login");
    });

    const unsubTrade = onSnapshot(doc(db, "agent_requests", id), async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setTrade(data);
        
        // Fetch agent's bank details from their agent profile
        const agentSnap = await getDoc(doc(db, "agents", data.agentId));
        if (agentSnap.exists()) setAgentData(agentSnap.data());
      }
    });

    const q = query(collection(db, "agent_requests", id, "messages"), orderBy("timestamp", "asc"));
    const unsubMsgs = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });

    return () => { unsubAuth(); unsubTrade(); unsubMsgs(); };
  }, [id, router]);

  const sendMessage = async (imgUrl = null) => {
    if (!text && !imgUrl) return;
    const msgText = text;
    setText(""); 
    await addDoc(collection(db, "agent_requests", id, "messages"), {
      senderId: user.uid,
      text: msgText,
      image: imgUrl,
      timestamp: serverTimestamp(),
    });
  };

  const handleImage = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const storageRef = ref(storage, `trades/${id}/${Date.now()}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await sendMessage(url);
    } catch (err) {
      alert("Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (!trade) return <div className="h-screen bg-[#0f172a] flex items-center justify-center"><Loader2 className="animate-spin text-[#613de6]" /></div>;

  const isAgent = user?.uid === trade.agentId;

  return (
    <div className="flex flex-col h-screen bg-[#0f172a] text-white">
      {/* Header */}
      <div className="p-4 bg-[#613de6] flex items-center justify-between shadow-lg">
        <button onClick={() => router.back()} className="p-2 bg-white/10 rounded-lg"><ChevronLeft size={20}/></button>
        <div className="text-center">
          <p className="text-[10px] font-black uppercase opacity-60">Trading with {isAgent ? trade.userName : trade.agentName}</p>
          <p className="text-lg font-black italic text-[#fc7952]">${trade.amount.toFixed(2)}</p>
        </div>
        <div className="w-10" />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
        {/* Agent Bank Details Card (Visible to User) */}
        {!isAgent && agentData && (
            <div className="bg-[#fc7952] p-5 rounded-3xl shadow-xl shadow-[#fc7952]/10 mb-6 border border-white/10">
                <div className="flex items-center gap-2 mb-3">
                    <Landmark size={18} className="text-white" />
                    <h3 className="text-xs font-black uppercase italic">Agent Bank Details</h3>
                </div>
                <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase opacity-80">Bank: {agentData.bank_name}</p>
                    <p className="text-sm font-black tracking-widest">{agentData.account_number}</p>
                    <p className="text-[10px] font-bold uppercase opacity-80">Name: {agentData.fullName}</p>
                </div>
            </div>
        )}

        <div className="bg-[#1e293b] p-4 rounded-2xl border border-white/5 flex flex-col items-center gap-2">
           <AlertCircle size={24} className="text-[#613de6]" />
           <p className="text-[10px] font-black text-center uppercase text-gray-400 leading-tight">
             {isAgent ? "Confirm your details above and wait for the user to upload payment proof." : "Transfer the money to the agent and upload a screenshot of the receipt here."}
           </p>
        </div>

        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.senderId === user?.uid ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] p-3 rounded-2xl ${m.senderId === user?.uid ? "bg-[#613de6] rounded-tr-none" : "bg-[#1e293b] rounded-tl-none border border-white/5"}`}>
              {m.image && <img src={m.image} className="rounded-xl mb-2 w-full object-cover max-h-64" alt="Proof" />}
              {m.text && <p className="text-sm font-medium">{m.text}</p>}
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      {/* Footer Chat Input */}
      <div className="p-4 bg-[#1e293b] border-t border-white/5 pb-8">
          <div className="flex items-center gap-2">
            <label className="p-4 bg-[#0f172a] rounded-2xl cursor-pointer hover:bg-white/5 transition-all border border-white/5">
              {uploading ? <Loader2 size={20} className="animate-spin" /> : <Image size={20} className="text-[#613de6]" />}
              <input type="file" className="hidden" onChange={handleImage} disabled={uploading} />
            </label>
            <input 
              value={text} 
              onChange={(e) => setText(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Send proof or message..."
              className="flex-1 bg-[#0f172a] border border-white/5 p-4 rounded-2xl text-sm focus:outline-none focus:border-[#613de6]"
            />
            <button onClick={() => sendMessage()} className="p-4 bg-[#fc7952] rounded-2xl active:scale-90 transition-all shadow-lg shadow-[#fc7952]/20"><Send size={20} /></button>
          </div>
      </div>
    </div>
  );
}