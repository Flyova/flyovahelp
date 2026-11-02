"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, deleteField, doc, limit, onSnapshot, orderBy, query, updateDoc, where } from "firebase/firestore";
import { authFetch } from "@/lib/authFetch";
import { CHAT_MUTE_DAYS, chatMuteLeft, isChatMuted } from "@/lib/chat";
import { Loader2, MessagesSquare, Trash2, User, Volume2, VolumeX } from "lucide-react";
import ChatRoomSearch from "@/components/admin/ChatRoomSearch";

// Admin → Chat Room: the general chatroom (chatroom_messages). Deleting goes through
// /api/chat/room (admins may delete any message); muting sets users/{uid}.chatMuted
// and, for 7 or 30 days, chatMutedUntil (lib/chat), which the room route checks
// before every post.

const when = (ts) => (ts?.toDate ? ts.toDate().toLocaleString() : "-");
const daysFromNow = (days) => Date.now() + days * 86400000;

export default function AdminChatRoom() {
  const [messages, setMessages] = useState([]);
  const [muted, setMuted] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [choosing, setChoosing] = useState(null); // message whose "mute for how long" choices are showing

  useEffect(() => {
    const unsubMessages = onSnapshot(query(collection(db, "chatroom_messages"), orderBy("createdAt", "desc"), limit(200)), (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error("Chatroom load failed:", err);
      setLoading(false);
    });
    // A mute that ran out stays chatMuted: true but no longer counts.
    const unsubMuted = onSnapshot(query(collection(db, "users"), where("chatMuted", "==", true)), (snap) => {
      setMuted(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => isChatMuted(u)));
    });
    authFetch("/api/chat/room").then((r) => { if (!r.error) setStats(r); }).catch(() => {});
    return () => { unsubMessages(); unsubMuted(); };
  }, []);

  const mutedIds = useMemo(() => new Set(muted.map((u) => u.id)), [muted]);

  const deleteMessage = async (m) => {
    if (!window.confirm(`Delete @${m.sender}'s message for everyone?`)) return;
    setBusy(m.id);
    const res = await authFetch("/api/chat/room", { method: "POST", body: { action: "delete", id: m.id } });
    setBusy(null);
    if (res.error) alert(res.error);
  };

  // `days`: 7 or 30, null forever; false unmutes.
  const setMute = async (uid, name, days) => {
    if (!uid) return;
    const how = days ? `for ${days} days` : "forever";
    if (!window.confirm(days !== false ? `Mute @${name} in the chatroom ${how}? They won't be able to post.` : `Let @${name} post in the chatroom again?`)) return;
    setChoosing(null);
    setBusy(uid);
    try {
      await updateDoc(doc(db, "users", uid), days === false
        ? { chatMuted: false, chatMutedUntil: deleteField() }
        : { chatMuted: true, chatMutedUntil: days ? daysFromNow(days) : deleteField() });
    } catch (err) {
      alert("Couldn't change it: " + err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-sky-100 text-sky-600 rounded-3xl">
              <MessagesSquare size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-black uppercase italic tracking-tighter">Chat Room</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                {stats ? `${stats.members} chat usernames · ${stats.online} online now · ` : ""}{muted.length} muted
              </p>
            </div>
          </div>
        </div>

        <ChatRoomSearch />

        {muted.length > 0 && (
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Muted players</p>
            <div className="flex flex-wrap gap-2">
              {muted.map((u) => (
                <span key={u.id} className="inline-flex items-center gap-2 bg-rose-50 border border-rose-100 text-rose-700 rounded-full pl-3 pr-1 py-1 text-[10px] font-black uppercase">
                  <Link href={`/admin/users/${u.id}`}>{u.username ? `@${u.username}` : u.fullName || u.id.slice(0, 8)}</Link>
                  <span className="font-bold normal-case text-rose-500">{chatMuteLeft(u) ? `${chatMuteLeft(u)} left` : "forever"}</span>
                  <button onClick={() => setMute(u.id, u.username || u.fullName, false)} disabled={busy === u.id}
                    className="px-2 py-1 rounded-full bg-white text-rose-600 hover:bg-rose-100">Unmute</button>
                </span>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20 text-slate-400"><Loader2 className="animate-spin" /></div>
        ) : messages.length === 0 ? (
          <div className="bg-white rounded-[2rem] border border-slate-100 p-12 text-center text-[11px] font-black uppercase tracking-widest text-slate-400">
            No chatroom messages yet.
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((m) => {
              const isMuted = mutedIds.has(m.senderUid);
              return (
                <div key={m.id} className={`bg-white rounded-[1.5rem] border p-4 flex flex-col md:flex-row md:items-start gap-3 ${m.deletedForEveryone ? "border-slate-100 opacity-60" : "border-slate-100"}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black text-slate-800">@{m.senderName || m.sender}</span>
                      {isMuted && <span className="text-[9px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-black uppercase">Muted</span>}
                      {m.kind === "coins" && <span className="text-[9px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-black uppercase">Coins</span>}
                      {m.deletedForEveryone && <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-black uppercase">Deleted</span>}
                      <span className="text-[10px] font-bold text-slate-400">{when(m.createdAt)}</span>
                    </div>
                    {m.replyTo && (
                      <p className="text-[10px] font-bold text-slate-400 mt-1 truncate">↪ @{m.replyTo.sender}: {m.replyTo.text}</p>
                    )}
                    <p className="text-sm font-bold text-slate-600 mt-1 break-words">{m.text}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {m.senderUid && (
                      <Link href={`/admin/users/${m.senderUid}`} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-black uppercase inline-flex items-center gap-1 hover:bg-slate-200">
                        <User size={12} /> Player
                      </Link>
                    )}
                    {m.senderUid && choosing !== m.id && (
                      <button onClick={() => (isMuted ? setMute(m.senderUid, m.sender, false) : setChoosing(m.id))} disabled={busy === m.senderUid}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase inline-flex items-center gap-1 ${isMuted ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-amber-50 text-amber-700 hover:bg-amber-100"}`}>
                        {isMuted ? <Volume2 size={12} /> : <VolumeX size={12} />} {isMuted ? "Unmute" : "Mute"}
                      </button>
                    )}
                    {m.senderUid && choosing === m.id && (
                      <span className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-amber-50 p-1">
                        <span className="px-2 text-[10px] font-black uppercase text-amber-700">Mute for</span>
                        {[...CHAT_MUTE_DAYS, null].map((days) => (
                          <button key={days ?? "forever"} onClick={() => setMute(m.senderUid, m.sender, days)}
                            className="px-2.5 py-1.5 rounded-lg bg-white text-amber-700 text-[10px] font-black uppercase hover:bg-amber-100">
                            {days ? `${days} days` : "Forever"}
                          </button>
                        ))}
                        <button onClick={() => setChoosing(null)} className="px-2 py-1.5 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600">Cancel</button>
                      </span>
                    )}
                    {!m.deletedForEveryone && (
                      <button onClick={() => deleteMessage(m)} disabled={busy === m.id}
                        className="px-3 py-2 rounded-xl bg-rose-50 text-rose-600 text-[10px] font-black uppercase inline-flex items-center gap-1 hover:bg-rose-100">
                        {busy === m.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
