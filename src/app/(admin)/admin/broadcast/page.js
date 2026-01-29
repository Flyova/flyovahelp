"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  onSnapshot, 
  deleteDoc, 
  doc 
} from "firebase/firestore";
import { 
  Send, 
  Megaphone, 
  Trash2, 
  Clock, 
  AlertTriangle,
  Info,
  CheckCircle2
} from "lucide-react";

export default function AdminBroadcast() {
  const [message, setMessage] = useState("");
  const [type, setType] = useState("info"); // info, warning, success
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const q = query(collection(db, "broadcasts"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const sendBroadcast = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    
    setSending(true);
    try {
      await addDoc(collection(db, "broadcasts"), {
        message: message,
        type: type,
        timestamp: serverTimestamp(),
        active: true
      });
      setMessage("");
      alert("Announcement sent to all users!");
    } catch (error) {
      console.error(error);
      alert("Failed to send broadcast.");
    } finally {
      setSending(false);
    }
  };

  const deleteBroadcast = async (id) => {
    if (confirm("Remove this announcement?")) {
      await deleteDoc(doc(db, "broadcasts", id));
    }
  };

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-black italic uppercase text-slate-800">Global Broadcast</h1>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Send real-time alerts to every user dashboard</p>
      </div>

      {/* Composer */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm">
        <form onSubmit={sendBroadcast} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-400 ml-2 tracking-widest">Message Content</label>
            <textarea 
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter your announcement here..."
              className="w-full bg-slate-50 border border-slate-100 rounded-[2rem] p-6 text-sm font-bold outline-none focus:border-[#613de6] transition-all min-h-[150px] resize-none"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button 
              type="button"
              onClick={() => setType("info")}
              className={`flex items-center justify-center gap-2 p-4 rounded-2xl border font-black uppercase text-[10px] transition-all ${type === 'info' ? 'bg-blue-50 border-blue-200 text-blue-600 shadow-inner' : 'bg-white border-slate-100 text-slate-400 opacity-60'}`}
            >
              <Info size={16} /> Info Alert
            </button>
            <button 
              type="button"
              onClick={() => setType("warning")}
              className={`flex items-center justify-center gap-2 p-4 rounded-2xl border font-black uppercase text-[10px] transition-all ${type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-600 shadow-inner' : 'bg-white border-slate-100 text-slate-400 opacity-60'}`}
            >
              <AlertTriangle size={16} /> Warning
            </button>
            <button 
              type="button"
              onClick={() => setType("success")}
              className={`flex items-center justify-center gap-2 p-4 rounded-2xl border font-black uppercase text-[10px] transition-all ${type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-600 shadow-inner' : 'bg-white border-slate-100 text-slate-400 opacity-60'}`}
            >
              <CheckCircle2 size={16} /> Success
            </button>
          </div>

          <button 
            disabled={sending}
            className="w-full bg-[#613de6] text-white py-5 rounded-2xl font-black uppercase italic tracking-[0.2em] shadow-xl shadow-[#613de6]/20 flex items-center justify-center gap-3 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {sending ? "Processing..." : (
              <>
                <Megaphone size={20} /> Broadcast Message
              </>
            )}
          </button>
        </form>
      </div>

      {/* History */}
      <div className="space-y-4">
        <h3 className="text-[10px] font-black uppercase text-slate-400 ml-4 tracking-[0.2em]">Recent Broadcasts</h3>
        <div className="space-y-3">
          {history.map((post) => (
            <div key={post.id} className="bg-white p-6 rounded-[2rem] border border-slate-200 flex items-start justify-between gap-4 group">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl shrink-0 mt-1 ${
                  post.type === 'warning' ? 'bg-amber-100 text-amber-600' : 
                  post.type === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'
                }`}>
                  <Megaphone size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-700 leading-relaxed mb-2">{post.message}</p>
                  <div className="flex items-center gap-3 text-[9px] font-black uppercase text-slate-400">
                    <span className="flex items-center gap-1"><Clock size={12}/> {post.timestamp?.toDate().toLocaleString()}</span>
                    <span className={`px-2 py-0.5 rounded-md ${
                      post.type === 'warning' ? 'bg-amber-50 text-amber-500' : 
                      post.type === 'success' ? 'bg-emerald-50 text-emerald-500' : 'bg-blue-50 text-blue-500'
                    }`}>{post.type}</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => deleteBroadcast(post.id)}
                className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}