"use client";
import { useEffect, useState, useRef } from "react";
import { 
  Search, MessageCircle, Send, Loader2, 
  User, Clock, ChevronLeft, Bell, MoreVertical
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { 
  collection, query, orderBy, onSnapshot, 
  doc, updateDoc, arrayUnion, serverTimestamp, getDoc 
} from "firebase/firestore";

export default function AdminSupport() {
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef(null);

  useEffect(() => {
    const q = query(collection(db, "support_chats"), orderBy("updatedAt", "desc"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const chatList = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setChats(chatList);
      setLoading(false);
      
      // Update selected chat details if it's currently open
      if (selectedChat) {
        const updated = chatList.find(c => c.id === selectedChat.id);
        if (updated) setSelectedChat(updated);
      }
    });
    return () => unsubscribe();
  }, [selectedChat?.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedChat?.messages]);

  const selectChat = async (chat) => {
    setSelectedChat(chat);
    if (chat.unreadByAdmin) {
      const chatRef = doc(db, "support_chats", chat.id);
      await updateDoc(chatRef, { unreadByAdmin: false });
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedChat || sending) return;

    setSending(true);
    const text = replyText;
    setReplyText("");

    try {
      const chatRef = doc(db, "support_chats", selectedChat.id);
      
      // Ensure the document exists before updating
      const snap = await getDoc(chatRef);
      if (snap.exists()) {
        await updateDoc(chatRef, {
          messages: arrayUnion({
            text: text,
            senderId: "admin",
            senderType: "admin",
            timestamp: new Date().toISOString()
          }),
          lastMessage: text,
          updatedAt: serverTimestamp(),
          unreadByUser: true 
        });
      }
    } catch (err) {
      console.error("Reply Error:", err);
      alert("Failed to send message. Check console.");
      setReplyText(text);
    } finally {
      setSending(false);
    }
  };

  if (loading) return (
    <div className="h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="animate-spin text-blue-600" size={32} />
    </div>
  );

  return (
    <div className="flex h-screen bg-white text-slate-900 overflow-hidden font-sans">
      
      {/* SIDEBAR */}
      <div className={`w-full md:w-96 flex flex-col border-r border-gray-200 bg-gray-50/50 ${selectedChat ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-6 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-slate-800">Messages</h1>
            <div className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-[10px] font-black uppercase">Admin</div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input placeholder="Search users..." className="w-full bg-gray-100 border-none rounded-xl py-2.5 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {chats.map((chat) => (
            <div 
              key={chat.id}
              onClick={() => selectChat(chat)}
              className={`p-4 cursor-pointer transition-all border-b border-gray-100 flex items-center gap-4 hover:bg-white
                ${selectedChat?.id === chat.id ? 'bg-white shadow-sm z-10' : ''}
              `}
            >
              <div className="relative shrink-0">
                <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-blue-200 shadow-lg">
                  {chat.userEmail?.charAt(0).toUpperCase() || "U"}
                </div>
                {chat.unreadByAdmin && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-bounce" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-0.5">
                  <p className={`text-sm truncate ${chat.unreadByAdmin ? 'font-bold text-slate-900' : 'font-medium text-slate-600'}`}>
                    {chat.userEmail}
                  </p>
                  <span className="text-[10px] text-gray-400 font-medium">Just now</span>
                </div>
                <p className={`text-xs truncate ${chat.unreadByAdmin ? 'text-blue-600 font-bold' : 'text-gray-400 font-normal'}`}>
                  {chat.unreadByAdmin ? "New message received" : chat.lastMessage}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CHAT AREA */}
      <div className={`flex-1 flex flex-col bg-white ${!selectedChat ? 'hidden md:flex items-center justify-center' : 'flex'}`}>
        {!selectedChat ? (
          <div className="text-center">
            <div className="bg-gray-50 p-6 rounded-full inline-block mb-4">
               <MessageCircle size={48} className="text-gray-300" />
            </div>
            <h3 className="text-slate-400 font-medium italic">Select a conversation to reply</h3>
          </div>
        ) : (
          <>
            {/* CHAT HEADER */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between px-8">
              <div className="flex items-center gap-4">
                <button onClick={() => setSelectedChat(null)} className="md:hidden p-2 -ml-2 text-gray-400">
                  <ChevronLeft />
                </button>
                <div>
                  <h2 className="text-base font-bold text-slate-800">{selectedChat.userEmail}</h2>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-green-500 rounded-full" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Active Ticket</span>
                  </div>
                </div>
              </div>
              <button className="p-2 hover:bg-gray-50 rounded-full text-gray-400"><MoreVertical size={20}/></button>
            </div>

            {/* MESSAGES */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-6 bg-gray-50/30">
              {selectedChat.messages.map((msg, i) => {
                const isAdmin = msg.senderType === 'admin';
                return (
                  <div key={i} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] p-4 rounded-2xl shadow-sm text-sm ${
                      isAdmin 
                      ? 'bg-blue-600 text-white rounded-br-none' 
                      : 'bg-white text-slate-700 border border-gray-100 rounded-bl-none'
                    }`}>
                      <p className="font-medium leading-relaxed">{msg.text}</p>
                      <p className={`text-[9px] mt-2 font-bold uppercase tracking-widest ${isAdmin ? 'text-blue-100' : 'text-gray-300'}`}>
                        {isAdmin ? 'Admin • 10:25 AM' : 'User • 10:24 AM'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* INPUT AREA */}
            <div className="p-6 bg-white border-t border-gray-100">
              <form onSubmit={handleSendReply} className="flex items-center gap-4 max-w-5xl mx-auto">
                <div className="flex-1 bg-gray-100 rounded-2xl px-4 py-3 flex items-center border border-transparent focus-within:border-blue-500 transition-all">
                  <input 
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write your response..."
                    className="flex-1 bg-transparent outline-none text-sm font-medium text-slate-700 placeholder:text-gray-400"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={!replyText.trim() || sending}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest shadow-lg shadow-blue-200 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                >
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <><Send size={16}/> Send</>}
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}