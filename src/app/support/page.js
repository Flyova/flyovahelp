"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  Send, Loader2, MessageCircle, ChevronLeft, 
  User, ShieldCheck, Image as ImageIcon, Bell, X
} from "lucide-react";
// FIREBASE IMPORTS
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { 
  doc, onSnapshot, collection, query, 
  orderBy, addDoc, serverTimestamp, setDoc, 
  updateDoc, arrayUnion 
} from "firebase/firestore";

export default function SupportChat() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push("/login");
      } else {
        setUser(currentUser);
        
        const chatDocRef = doc(db, "support_chats", currentUser.uid);
        
        const unsubChat = onSnapshot(chatDocRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setMessages(data.messages || []);
            
            // Clear the unread status for the user when they open the chat
            if (data.unreadByUser === true) {
              updateDoc(chatDocRef, { unreadByUser: false });
            }
          } else {
            setDoc(chatDocRef, { 
              userId: currentUser.uid, 
              userEmail: currentUser.email,
              lastMessage: "Chat started",
              updatedAt: serverTimestamp(),
              messages: [],
              unreadByAdmin: false,
              unreadByUser: false
            });
          }
          setLoading(false);
        });

        return () => unsubChat();
      }
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    const textToSend = newMessage;
    setNewMessage(""); 

    const messageData = {
      text: textToSend,
      senderId: user.uid,
      senderType: "user",
      timestamp: new Date().toISOString(), 
    };

    try {
      const chatDocRef = doc(db, "support_chats", user.uid);
      await updateDoc(chatDocRef, {
        messages: arrayUnion(messageData),
        lastMessage: textToSend,
        updatedAt: serverTimestamp(),
        unreadByAdmin: true 
      });
    } catch (error) {
      console.error("Error sending message:", error);
      setNewMessage(textToSend); 
    } finally {
      setSending(false);
    }
  };

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      alert("Notifications enabled!");
    }
  };

  if (loading) {
    return (
      <div className="h-screen bg-[#0f172a] flex flex-col items-center justify-center text-white">
        <Loader2 className="animate-spin text-[#613de6] mb-4" size={40} />
        <p className="text-[10px] font-black uppercase tracking-widest opacity-50">Connecting...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-h-screen bg-[#0f172a] text-white overflow-hidden">
      
      {/* HEADER */}
      <div className="shrink-0 p-6 bg-[#1e293b] border-b border-white/5 flex items-center justify-between shadow-xl z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 bg-white/5 rounded-xl text-gray-400 active:scale-90 transition-all">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
              Live Support <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            </h2>
            <p className="text-[10px] font-bold text-gray-500 uppercase italic">Online</p>
          </div>
        </div>
        <button 
          onClick={requestNotificationPermission}
          className="p-2.5 bg-[#613de6]/20 text-[#613de6] rounded-xl active:scale-95"
        >
          <Bell size={18} />
        </button>
      </div>

      {/* MESSAGES AREA */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
            <MessageCircle size={80} className="mb-6 text-[#613de6]" />
            <p className="text-xs font-black uppercase tracking-[0.3em]">Support is Online</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.senderType === "user";
            return (
              <div key={idx} className={`flex ${isMe ? "justify-end" : "justify-start"} animate-in slide-in-from-bottom-4`}>
                <div className={`max-w-[85%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                  <div className={`p-4 rounded-[1.8rem] text-sm font-bold shadow-2xl ${
                    isMe 
                    ? "bg-[#613de6] text-white rounded-tr-none border border-white/10" 
                    : "bg-[#1e293b] text-white border border-white/5 rounded-tl-none"
                  }`}>
                    {msg.text}
                  </div>
                  <span className="text-[8px] font-black uppercase text-gray-600 mt-2 px-1">
                    {isMe ? "Sent" : "Agent"}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* INPUT AREA - ADJUSTED FOR BOTTOM NAV BAR */}
      <div className="shrink-0 p-6 bg-[#1e293b] border-t border-white/5 pb-32"> 
        <form onSubmit={sendMessage} className="flex items-center gap-3 max-w-4xl mx-auto">
          <div className="flex-1 relative">
            <input 
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="w-full bg-black/40 border border-white/5 rounded-2xl py-4 px-6 text-sm font-bold text-white outline-none focus:border-[#613de6] transition-all"
            />
          </div>
          <button 
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="bg-[#613de6] p-4 rounded-2xl text-white shadow-xl active:scale-95 disabled:opacity-30"
          >
            {sending ? <Loader2 size={22} className="animate-spin" /> : <Send size={22} />}
          </button>
        </form>
      </div>
    </div>
  );
}