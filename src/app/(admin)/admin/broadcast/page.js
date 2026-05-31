"use client";
import { useCallback, useState, useEffect } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { 
  Megaphone, 
  Trash2, 
  Clock, 
  AlertTriangle,
  Info,
  CheckCircle2,
  Loader2
} from "lucide-react";

const formatTimestamp = (value) => {
  if (!value) return "Just now";
  if (typeof value?.toDate === "function") return value.toDate().toLocaleString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Just now" : date.toLocaleString();
};

const getAdminToken = async () => {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("You are logged out. Please sign in again.");
  return currentUser.getIdToken();
};

export default function AdminBroadcast() {
  const [message, setMessage] = useState("");
  const [type, setType] = useState("info"); // info, warning, success
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadAnnouncements = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setLoadError("");
    }

    try {
      const token = await getAdminToken();
      const response = await fetch("/api/admin/announcements", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || "Could not load announcements.");
      }

      setHistory(Array.isArray(payload.announcements) ? payload.announcements : []);
      setLoadError("");
    } catch (error) {
      console.error("Announcements fetch error:", error);
      if (!silent) setLoadError(error?.message || "Could not load announcements.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        setLoading(false);
        setLoadError("You are logged out. Please sign in again.");
        setHistory([]);
        return;
      }

      loadAnnouncements();
    });

    return () => unsubscribe();
  }, [loadAnnouncements]);

  const sendBroadcast = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    
    setSending(true);
    try {
      const token = await getAdminToken();
      const response = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message, type }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to send announcement.");
      }

      if (payload.announcement) {
        setHistory((current) => [
          payload.announcement,
          ...current.filter((post) => post.id !== payload.announcement.id),
        ]);
      } else {
        await loadAnnouncements({ silent: true });
      }

      setMessage("");
      alert("Announcement sent to all users!");
    } catch (error) {
      console.error("Announcement send error:", error);
      alert(error?.message || "Failed to send announcement.");
    } finally {
      setSending(false);
    }
  };

  const deleteBroadcast = async (id) => {
    if (confirm("Remove this announcement? It will disappear for all users.")) {
      try {
        const token = await getAdminToken();
        const response = await fetch(`/api/admin/announcements?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload?.error || "Failed to delete announcement.");
        }

        setHistory((current) => current.filter((post) => post.id !== id));
      } catch (err) {
        console.error("Announcement delete error:", err);
        alert(err?.message || "Failed to delete announcement.");
      }
    }
  };

  return (
    <div className="max-w-4xl space-y-8 p-4 text-white">
      <div>
        <h1 className="text-2xl font-black italic uppercase text-white">Global Broadcast</h1>
        <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">Send real-time alerts to every user dashboard</p>
      </div>

      {/* Composer */}
      <div className="bg-[#0f172a] rounded-[2.5rem] border border-white/10 p-8 shadow-sm">
        <form onSubmit={sendBroadcast} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-300 ml-2 tracking-widest">Message Content</label>
            <textarea 
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter your announcement here..."
              className="w-full bg-[#020617] border text-white placeholder:text-slate-500 border-white/10 rounded-[2rem] p-6 text-sm font-bold outline-none focus:border-[#613de6] transition-all min-h-[120px] resize-none"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button 
              type="button"
              onClick={() => setType("info")}
              className={`flex items-center justify-center gap-2 p-4 rounded-2xl border font-black uppercase text-[10px] transition-all ${type === 'info' ? 'bg-blue-500/20 border-blue-400 text-blue-200' : 'bg-[#020617] border-white/10 text-slate-300'}`}
            >
              <Info size={16} /> Info
            </button>
            <button 
              type="button"
              onClick={() => setType("warning")}
              className={`flex items-center justify-center gap-2 p-4 rounded-2xl border font-black uppercase text-[10px] transition-all ${type === 'warning' ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-[#020617] border-white/10 text-slate-300'}`}
            >
              <AlertTriangle size={16} /> Warning
            </button>
            <button 
              type="button"
              onClick={() => setType("success")}
              className={`flex items-center justify-center gap-2 p-4 rounded-2xl border font-black uppercase text-[10px] transition-all ${type === 'success' ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200' : 'bg-[#020617] border-white/10 text-slate-300'}`}
            >
              <CheckCircle2 size={16} /> Success
            </button>
          </div>

          <button 
            disabled={sending}
            className="w-full bg-[#613de6] text-white py-5 rounded-2xl font-black uppercase italic tracking-[0.2em] shadow-xl shadow-[#613de6]/20 flex items-center justify-center gap-3 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {sending ? "Sending..." : (
              <>
                <Megaphone size={20} /> Broadcast Message
              </>
            )}
          </button>
        </form>
      </div>

      {/* History */}
      <div className="space-y-4">
        <h3 className="text-[10px] font-black uppercase text-slate-300 ml-4 tracking-[0.2em]">Recent Broadcasts</h3>
        <div className="space-y-3">
          {loading && (
            <div className="text-center py-10 bg-[#0f172a] rounded-[2rem] border border-dashed border-white/10">
              <Loader2 className="mx-auto mb-3 animate-spin text-[#613de6]" size={24} />
              <p className="text-[10px] font-black uppercase text-slate-400">Loading announcements</p>
            </div>
          )}
          {!loading && loadError && (
            <div className="text-center py-10 bg-rose-500/10 rounded-[2rem] border border-rose-500/20">
              <p className="text-[10px] font-black uppercase text-rose-200">{loadError}</p>
            </div>
          )}
          {!loading && !loadError && history.length === 0 && (
            <div className="text-center py-10 bg-[#0f172a] rounded-[2rem] border border-dashed border-white/10">
               <p className="text-[10px] font-black uppercase text-slate-400">No active broadcasts</p>
            </div>
          )}
          {!loading && !loadError && history.map((post) => (
            <div key={post.id} className="bg-[#0f172a] p-6 rounded-[2rem] border border-white/10 flex items-start justify-between gap-4 group hover:border-white/20 transition-all">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl shrink-0 mt-1 ${
                  post.type === 'warning' ? 'bg-amber-100 text-amber-600' : 
                  post.type === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'
                }`}>
                  <Megaphone size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-100 leading-relaxed mb-2">{post.message}</p>
                  <div className="flex items-center gap-3 text-[9px] font-black uppercase text-slate-300">
                    <span className="flex items-center gap-1">
                      <Clock size={12}/> 
                      {formatTimestamp(post.timestamp)}
                    </span>
                    <span className={`px-2 py-0.5 rounded-md font-bold ${
                      post.type === 'warning' ? 'bg-amber-50 text-amber-500' : 
                      post.type === 'success' ? 'bg-emerald-50 text-emerald-500' : 'bg-blue-50 text-blue-500'
                    }`}>{post.type}</span>
                  </div>
                </div>
              </div>
              
              {/* DELETE BUTTON */}
            <button 
                onClick={() => deleteBroadcast(post.id)}
                className="flex items-center gap-2 px-4 py-2 text-rose-300 hover:bg-rose-500/10 rounded-xl transition-all border border-transparent hover:border-rose-500/20"
                title="Delete Broadcast"
              >
                <Trash2 size={16} />
                <span className="text-[10px] font-black uppercase tracking-widest">Delete</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
