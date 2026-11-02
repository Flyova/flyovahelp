"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, updateDoc, writeBatch } from "firebase/firestore";
import {
  AlertTriangle, Bell, CheckCircle2, ChevronLeft, Gamepad2, Info, Landmark, Mail, MailOpen, Megaphone, MessageCircle,
  ShieldCheck, SlidersHorizontal, Trash2, Users,
} from "lucide-react";
import { DELETED_ANNOUNCEMENTS, FEED_KINDS, READ_ANNOUNCEMENTS, shownInFeed, storeIds, storedIds } from "@/lib/notificationFeed";

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

const timeOf = (ts) => ts?.toDate?.() || null;

export default function NotificationsPage() {
  const router = useRouter();
  const [uid, setUid] = useState(null);
  const [items, setItems] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [seen, setSeen] = useState(() => new Set());
  const [deleted, setDeleted] = useState(() => new Set());
  const [feed, setFeed] = useState(null); // users/{uid}.notificationFeed: the kinds hidden from this page
  const [choosing, setChoosing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");

  useEffect(() => {
    let unsubItems = null;
    let unsubAnnouncements = null;
    let unsubUser = null;
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) return router.push("/login");
      setUid(u.uid);
      setSeen(storedIds(READ_ANNOUNCEMENTS));
      setDeleted(storedIds(DELETED_ANNOUNCEMENTS));
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
      unsubUser = onSnapshot(doc(db, "users", u.uid), (snap) => setFeed(snap.data()?.notificationFeed || null), () => {});
    });
    return () => {
      unsubAuth();
      if (unsubItems) unsubItems();
      if (unsubAnnouncements) unsubAnnouncements();
      if (unsubUser) unsubUser();
    };
  }, [router]);

  const saveSeen = (next) => {
    setSeen(next);
    storeIds(READ_ANNOUNCEMENTS, next);
  };

  const setRead = (n, read) => {
    if (n.announcement) {
      const next = new Set(seen);
      if (read) next.add(n.id); else next.delete(n.id);
      return saveSeen(next);
    }
    if (!!n.read !== read) updateDoc(doc(db, "users", uid, "notifications", n.id), { read }).catch(() => {});
  };

  const open = (n) => {
    setRead(n, true);
    if (!n.announcement && n.url) router.push(n.url);
  };

  const remove = (n) => {
    if (!n.announcement) return deleteDoc(doc(db, "users", uid, "notifications", n.id)).catch(() => alert("Could not delete that notification. Please try again."));
    // Only the announcements still on the feed are remembered, so the list can't grow forever.
    const live = new Set(announcements.map((a) => a.id));
    const next = new Set([...deleted, n.id].filter((id) => live.has(id)));
    setDeleted(next);
    storeIds(DELETED_ANNOUNCEMENTS, next);
    saveSeen(new Set(seen).add(n.id)); // and no banner for it on the dashboard
  };

  const toggleKind = (key, on) => updateDoc(doc(db, "users", uid), { [`notificationFeed.${key}`]: on })
    .catch(() => alert("Could not change that setting. Please try again."));

  const all = [
    ...items.filter((n) => shownInFeed(feed, TYPES[n.type] ? n.type : "info")),
    ...(shownInFeed(feed, "announcement") ? announcements : []).filter((a) => !deleted.has(a.id)).map((a) => ({
      id: a.id, announcement: true, type: a.type || "info", title: a.type === "game" ? "Game update" : "Announcement",
      body: a.message, createdAt: a.timestamp, read: seen.has(a.id),
    })),
  ].sort((a, b) => (timeOf(b.createdAt)?.getTime() || 0) - (timeOf(a.createdAt)?.getTime() || 0));
  const shown = tab === "unread" ? all.filter((n) => !n.read) : all;
  const unreadCount = all.filter((n) => !n.read).length;
  const readCount = all.length - unreadCount;
  const hiddenKinds = FEED_KINDS.filter(([key]) => !shownInFeed(feed, key)).length;

  const markAllRead = async () => {
    const unreadItems = all.filter((n) => !n.read && !n.announcement);
    for (let i = 0; i < unreadItems.length; i += 400) {
      const batch = writeBatch(db);
      unreadItems.slice(i, i + 400).forEach((n) => batch.update(doc(db, "users", uid, "notifications", n.id), { read: true }));
      await batch.commit().catch(() => {});
    }
    saveSeen(new Set([...seen, ...all.filter((n) => n.announcement).map((n) => n.id)]));
  };

  const clearRead = async () => {
    if (!window.confirm(`Delete ${readCount} read notification${readCount === 1 ? "" : "s"}? Unread ones stay.`)) return;
    const readItems = all.filter((n) => n.read && !n.announcement);
    for (let i = 0; i < readItems.length; i += 400) {
      const batch = writeBatch(db);
      readItems.slice(i, i + 400).forEach((n) => batch.delete(doc(db, "users", uid, "notifications", n.id)));
      await batch.commit().catch(() => alert("Some notifications could not be deleted. Please try again."));
    }
    const readAnnouncements = all.filter((n) => n.read && n.announcement).map((n) => n.id);
    if (readAnnouncements.length) {
      const live = new Set(announcements.map((a) => a.id));
      const next = new Set([...deleted, ...readAnnouncements].filter((id) => live.has(id)));
      setDeleted(next);
      storeIds(DELETED_ANNOUNCEMENTS, next);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1220] text-white pb-12">
      <div className="p-6 pt-12 flex items-center justify-between gap-4 max-w-md mx-auto w-full">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-3 bg-[#142036] rounded-2xl border border-white/5 active:scale-90 transition-all">
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-xl font-black italic uppercase tracking-tighter">Notifications</h1>
        </div>
        <button onClick={() => setChoosing((v) => !v)} aria-expanded={choosing} aria-label="Choose what shows here"
          className={`p-3 rounded-2xl border transition-all active:scale-90 ${choosing ? "bg-[#2457D6] border-[#2457D6]" : "bg-[#142036] border-white/5"}`}>
          <SlidersHorizontal size={18} />
        </button>
      </div>

      <div className="px-6 max-w-md mx-auto w-full space-y-4">
        {choosing && (
          <div className="bg-[#142036] rounded-[2rem] p-5 border border-white/5">
            <h2 className="font-black italic uppercase text-sm">Choose what shows here</h2>
            <p className="text-[10px] text-white/50 mt-1 mb-2 font-bold">
              Turned-off kinds are hidden from this page and the bell. This doesn&apos;t change phone notifications: those are in{" "}
              <Link href="/settings" className="text-[#7A9BEE] underline">Settings → Notifications</Link>.
            </p>
            <div className="divide-y divide-white/5">
              {FEED_KINDS.map(([key, label, hint]) => {
                const on = shownInFeed(feed, key);
                return (
                  <label key={key} className="flex items-center justify-between gap-4 py-3 cursor-pointer">
                    <span>
                      <span className="block text-[12px] font-black uppercase">{label}</span>
                      <span className="block text-[10px] font-bold text-white/40">{hint}</span>
                    </span>
                    <button type="button" role="switch" aria-checked={on} aria-label={`Show ${label}`} onClick={() => toggleKind(key, !on)}
                      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? "bg-[#2457D6]" : "bg-white/10"}`}>
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
                    </button>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            {[["all", "All"], ["unread", `Unread${unreadCount ? ` (${unreadCount})` : ""}`]].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${tab === key ? "bg-[#2457D6]" : "bg-white/5 text-white/50"}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-3 ml-auto">
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap text-[#7A9BEE]">Mark all read</button>
            )}
            {readCount > 0 && (
              <button onClick={clearRead} className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap text-rose-300/80">Clear read</button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-[#142036] rounded-3xl animate-pulse" />)}</div>
        ) : shown.length === 0 ? (
          <div className="bg-[#142036] rounded-[2rem] p-12 border border-dashed border-white/10 text-center">
            <Bell size={40} className="mx-auto mb-4 text-white/10" />
            <p className="text-[10px] font-black uppercase text-white/30 tracking-widest">Nothing here yet</p>
            {hiddenKinds > 0 && (
              <button onClick={() => setChoosing(true)} className="mt-3 text-[10px] font-bold text-[#7A9BEE]">
                {hiddenKinds} kind{hiddenKinds === 1 ? " is" : "s are"} hidden. Change what shows
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {shown.map((n) => {
              const t = TYPES[n.type] || TYPES.info;
              const Icon = n.announcement && n.type !== "game" ? Megaphone : t.icon;
              const when = timeOf(n.createdAt);
              return (
                <div key={`${n.announcement ? "a" : "n"}_${n.id}`} data-notification={n.id}
                  className={`bg-[#142036] rounded-3xl border flex transition-all ${n.read ? "border-white/5 opacity-70" : "border-[#2457D6]/40"}`}>
                  <button onClick={() => open(n)} className="flex-1 min-w-0 text-left p-4 pr-2 flex gap-4">
                    <span className={`w-10 h-10 shrink-0 rounded-2xl flex items-center justify-center ${t.color}`}><Icon size={18} /></span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center justify-between gap-2">
                        <span className={`text-[9px] font-black uppercase tracking-widest ${t.color.split(" ")[0]}`}>{n.announcement ? `Announcement · ${t.label}` : t.label}</span>
                        {when && <span className="text-[9px] font-bold text-white/30 shrink-0">{when.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</span>}
                      </span>
                      <span className="block text-sm font-black mt-1 truncate">{n.title}</span>
                      {n.body && <span className="block text-[12px] font-bold text-white/60 mt-1 line-clamp-3">{n.body}</span>}
                    </span>
                  </button>
                  <span className="flex flex-col items-center justify-start gap-1 py-3 pr-3 shrink-0">
                    {!n.read ? <span className="w-2 h-2 rounded-full bg-[#8B1E3F] my-1" aria-label="Unread" /> : <span className="h-4" />}
                    <button onClick={() => setRead(n, !n.read)} aria-label={n.read ? "Mark as unread" : "Mark as read"} title={n.read ? "Mark as unread" : "Mark as read"}
                      className="p-1.5 rounded-xl text-white/40 hover:text-white hover:bg-white/5">
                      {n.read ? <Mail size={15} /> : <MailOpen size={15} />}
                    </button>
                    <button onClick={() => remove(n)} aria-label="Delete notification" title="Delete"
                      className="p-1.5 rounded-xl text-white/40 hover:text-rose-300 hover:bg-white/5">
                      <Trash2 size={15} />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
