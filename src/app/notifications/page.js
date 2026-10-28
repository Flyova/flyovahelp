"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc, writeBatch } from "firebase/firestore";
import {
  AlertTriangle, Bell, CheckCircle2, ChevronLeft, Gamepad2, Info, Landmark, Megaphone, MessageCircle, ShieldCheck, Users,
} from "lucide-react";

// Every kind of notification (lib/notifications on the server) and admin announcement.
const TYPES = {
  group: { label: "Group", icon: Users, color: "text-sky-400 bg-sky-500/10" },
  message: { label: "Private message", icon: MessageCircle, color: "text-sky-400 bg-sky-500/10" },
  merchant: { label: "Agent", icon: Landmark, color: "text-amber-400 bg-amber-500/10" },
  game: { label: "Game update", icon: Gamepad2, color: "text-violet-400 bg-violet-500/10" },
  account: { label: "Account activity", icon: ShieldCheck, color: "text-[#7A9BEE] bg-[#2457D6]/10" },
  info: { label: "Info", icon: Info, color: "text-[#7A9BEE] bg-[#2457D6]/10" },
  success: { label: "Success", icon: CheckCircle2, color: "text-green-400 bg-green-500/10" },
  warning: { label: "Warning", icon: AlertTriangle, color: "text-rose-400 bg-rose-500/10" },
};
const READ_ANNOUNCEMENTS = "read_announcements"; // shared with the dashboard's banners

const timeOf = (ts) => ts?.toDate?.() || null;
const readAnnouncements = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_ANNOUNCEMENTS) || "[]"));
  } catch {
    return new Set();
  }
};

export default function NotificationsPage() {
  const router = useRouter();
  const [uid, setUid] = useState(null);
  const [items, setItems] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [seen, setSeen] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");

  useEffect(() => {
    let unsubItems = null;
    let unsubAnnouncements = null;
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) return router.push("/login");
      setUid(u.uid);
      setSeen(readAnnouncements());
      unsubItems = onSnapshot(
        query(collection(db, "users", u.uid, "notifications"), orderBy("createdAt", "desc"), limit(60)),
        (snap) => {
          setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setLoading(false);
        },
        () => setLoading(false)
      );
      unsubAnnouncements = onSnapshot(query(collection(db, "broadcasts"), orderBy("timestamp", "desc"), limit(20)), (snap) => {
        setAnnouncements(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.active !== false));
      });
    });
    return () => {
      unsubAuth();
      if (unsubItems) unsubItems();
      if (unsubAnnouncements) unsubAnnouncements();
    };
  }, [router]);

  const open = async (n) => {
    if (n.announcement) {
      const next = new Set(seen).add(n.id);
      setSeen(next);
      try { localStorage.setItem(READ_ANNOUNCEMENTS, JSON.stringify([...next])); } catch {}
      return;
    }
    if (!n.read) updateDoc(doc(db, "users", uid, "notifications", n.id), { read: true }).catch(() => {});
    if (n.url) router.push(n.url);
  };

  const markAllRead = async () => {
    const unreadItems = items.filter((n) => !n.read);
    for (let i = 0; i < unreadItems.length; i += 400) {
      const batch = writeBatch(db);
      unreadItems.slice(i, i + 400).forEach((n) => batch.update(doc(db, "users", uid, "notifications", n.id), { read: true }));
      await batch.commit().catch(() => {});
    }
    const next = new Set([...seen, ...announcements.map((a) => a.id)]);
    setSeen(next);
    try { localStorage.setItem(READ_ANNOUNCEMENTS, JSON.stringify([...next])); } catch {}
  };

  const all = [
    ...items,
    ...announcements.map((a) => ({
      id: a.id, announcement: true, type: a.type || "info", title: a.type === "game" ? "Game update" : "Announcement",
      body: a.message, createdAt: a.timestamp, read: seen.has(a.id),
    })),
  ].sort((a, b) => (timeOf(b.createdAt)?.getTime() || 0) - (timeOf(a.createdAt)?.getTime() || 0));
  const shown = tab === "unread" ? all.filter((n) => !n.read) : all;
  const unreadCount = all.filter((n) => !n.read).length;

  return (
    <div className="min-h-screen bg-[#0B1220] text-white pb-12">
      <div className="p-6 pt-12 flex items-center justify-between gap-4 max-w-md mx-auto w-full">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-3 bg-[#142036] rounded-2xl border border-white/5 active:scale-90 transition-all">
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-xl font-black italic uppercase tracking-tighter">Notifications</h1>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="text-[10px] font-black uppercase tracking-widest text-[#7A9BEE]">Mark all read</button>
        )}
      </div>

      <div className="px-6 max-w-md mx-auto w-full space-y-4">
        <div className="flex gap-2">
          {[["all", "All"], ["unread", `Unread${unreadCount ? ` (${unreadCount})` : ""}`]].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${tab === key ? "bg-[#2457D6]" : "bg-white/5 text-white/50"}`}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-[#142036] rounded-3xl animate-pulse" />)}</div>
        ) : shown.length === 0 ? (
          <div className="bg-[#142036] rounded-[2rem] p-12 border border-dashed border-white/10 text-center">
            <Bell size={40} className="mx-auto mb-4 text-white/10" />
            <p className="text-[10px] font-black uppercase text-white/30 tracking-widest">Nothing here yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {shown.map((n) => {
              const t = TYPES[n.type] || TYPES.info;
              const Icon = n.announcement && n.type !== "game" ? Megaphone : t.icon;
              const when = timeOf(n.createdAt);
              return (
                <button key={`${n.announcement ? "a" : "n"}_${n.id}`} onClick={() => open(n)}
                  className={`w-full text-left bg-[#142036] rounded-3xl p-4 border flex gap-4 transition-all ${n.read ? "border-white/5 opacity-70" : "border-[#2457D6]/40"}`}>
                  <span className={`w-10 h-10 shrink-0 rounded-2xl flex items-center justify-center ${t.color}`}><Icon size={18} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center justify-between gap-2">
                      <span className={`text-[9px] font-black uppercase tracking-widest ${t.color.split(" ")[0]}`}>{n.announcement ? `Announcement · ${t.label}` : t.label}</span>
                      {when && <span className="text-[9px] font-bold text-white/30 shrink-0">{when.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</span>}
                    </span>
                    <span className="block text-sm font-black mt-1 truncate">{n.title}</span>
                    {n.body && <span className="block text-[12px] font-bold text-white/60 mt-1 line-clamp-3">{n.body}</span>}
                  </span>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-[#8B1E3F] mt-2 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
