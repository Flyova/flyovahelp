"use client";
import { useEffect, useState, useRef } from "react";
import { 
  Search, MessageCircle, Send, Loader2, 
  ChevronLeft, MoreVertical
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

const CHAT_NOTIFY_EMAIL = "contact.notifications.surname@gmail.com";
const CLEANUP_STORAGE_KEY = "support_cleanup_last_run";
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const SUPPORT_POLL_INTERVAL_MS = 5000;

export default function AdminSupport() {
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    const now = Date.now();
    const lastRun = Number(localStorage.getItem(CLEANUP_STORAGE_KEY) || 0);
    if (now - lastRun < CLEANUP_INTERVAL_MS) return;

    fetch("/api/cron/cleanup-chats")
      .then(() => localStorage.setItem(CLEANUP_STORAGE_KEY, String(now)))
      .catch((err) => console.error("Support cleanup trigger failed:", err));
  }, []);

  useEffect(() => {
    let pollTimer = null;
    let active = true;

    const fetchSupportChats = async ({ silent = false } = {}) => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        if (!silent && active) {
          setLoading(false);
          setLoadError("You are logged out. Please sign in again.");
          setChats([]);
          setSelectedChat(null);
        }
        return;
      }

      try {
        const token = await currentUser.getIdToken();
        const response = await fetch("/api/admin/support-chats", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload?.error || "Could not load support chats right now.");
        }

        const chatList = Array.isArray(payload.chats) ? payload.chats : [];
        if (!active) return;

        setChats(chatList);
        setLoadError("");
        setSelectedChat((currentSelected) => {
          if (!currentSelected) return null;
          return chatList.find((chat) => chat.id === currentSelected.id) || null;
        });
      } catch (error) {
        console.error("Support chats fetch error:", error);
        if (!active) return;
        if (!silent) {
          setLoadError(error?.message || "Could not load support chats right now.");
        }
      } finally {
        if (!silent && active) {
          setLoading(false);
        }
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }

      if (!currentUser) {
        setLoading(false);
        setLoadError("You are logged out. Please sign in again.");
        setChats([]);
        setSelectedChat(null);
        return;
      }

      setLoading(true);
      setLoadError("");
      await fetchSupportChats({ silent: false });

      pollTimer = window.setInterval(() => {
        fetchSupportChats({ silent: true });
      }, SUPPORT_POLL_INTERVAL_MS);
    });

    return () => {
      active = false;
      if (pollTimer) {
        clearInterval(pollTimer);
      }
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selectedChat?.messages]);

  const selectChat = async (chat) => {
    setSelectedChat(chat);
    if (chat.unreadByAdmin) {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        await fetch("/api/admin/support-chats", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: "mark_read",
            chatId: chat.id,
          }),
        });
      } catch (error) {
        console.error("Mark read failed:", error);
      }
    }
  };

  const markResolved = async () => {
    if (!selectedChat) return;
    if (selectedChat.resolved) return;
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const response = await fetch("/api/admin/support-chats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "mark_resolved",
          chatId: selectedChat.id,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Could not resolve ticket.");
      }
      setSelectedChat((prev) => (prev ? { ...prev, resolved: true } : prev));
    } catch (err) {
      console.error("Resolve Error:", err);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedChat || sending) return;

    setSending(true);
    const text = replyText;
    setReplyText("");

    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("You are logged out. Please sign in again.");

      const response = await fetch("/api/admin/support-chats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "reply",
          chatId: selectedChat.id,
          message: text,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Failed to send message.");
      }

      try {
        await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: CHAT_NOTIFY_EMAIL,
            subject: "Support Notification: Admin Reply Sent",
            html: `<p><strong>Sender:</strong> Admin</p><p><strong>User:</strong> ${selectedChat.userEmail}</p><p><strong>Message:</strong> ${text}</p>`,
          }),
        });
      } catch (e) {
        console.error("Admin live chat notification email failed:", e);
      }
    } catch (err) {
      console.error("Reply Error:", err);
      alert(err?.message || "Failed to send message. Check console.");
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

  if (loadError) {
    return (
      <div className="h-screen bg-[#0b1220] text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-3xl border border-rose-400/20 bg-[#111827] p-8 text-center space-y-4">
          <h2 className="text-lg font-black uppercase tracking-wide text-rose-300">Support Unavailable</h2>
          <p className="text-sm text-slate-300">{loadError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-3 rounded-2xl bg-[#613de6] hover:bg-[#724fff] text-xs font-black uppercase tracking-widest"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

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
            <input placeholder="Search users..." className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm font-semibold text-slate-900 placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 outline-none" />
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
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                      {selectedChat.resolved ? "Resolved" : "Active Ticket"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={markResolved}
                  className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-100 transition-colors"
                >
                  Mark Resolved
                </button>
                <button className="p-2 hover:bg-gray-50 rounded-full text-gray-400"><MoreVertical size={20}/></button>
              </div>
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
                      <p className={`text-[9px] mt-2 font-bold uppercase tracking-widest ${isAdmin ? 'text-blue-100' : 'text-slate-500'}`}>
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
                <div className="flex-1 bg-[#020617] rounded-2xl px-4 py-3 flex items-center border border-white/10 focus-within:border-blue-500 transition-all">
                  <input 
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Write your response..."
                    className="flex-1 bg-transparent outline-none text-sm font-semibold text-white placeholder:text-slate-400 caret-white"
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
