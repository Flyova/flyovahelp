"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection, doc, query, where, orderBy, limit, onSnapshot,
  addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { norm, isValidText, containsMediaMarker, dmIdFor } from "@/lib/chat";
import { notifyPush } from "@/lib/pushClient";

export default function ChatPage() {
  const router = useRouter();
  const [uid, setUid] = useState(null);
  const [identities, setIdentities] = useState([]);
  const [active, setActive] = useState(""); // usernameLower sending as
  const [convos, setConvos] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [newUsername, setNewUsername] = useState("");
  const [groupName, setGroupName] = useState("");
  const [profile, setProfile] = useState({ bio: "", status: "", avatarUrl: "", coverUrl: "" });
  const [sessions, setSessions] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => onAuthStateChanged(auth, (u) => {
    if (!u) return router.push("/login");
    setUid(u.uid);
  }), [router]);

  // my identities
  useEffect(() => {
    if (!uid) return;
    fetch(`/api/chat/usernames?uid=${uid}`).then((r) => r.json()).then((d) => {
      setIdentities(d.items || []);
      if (!active && d.items?.length) setActive(d.items.find((x) => x.isDefault)?.usernameLower || d.items[0].usernameLower);
    }).catch(() => {});
  }, [uid]); // eslint-disable-line

  // my conversations (where I participate under any identity)
  useEffect(() => {
    if (!identities.length) return;
    const lowers = identities.map((i) => i.usernameLower);
    const unsubs = lowers.slice(0, 10).map((l) =>
      onSnapshot(query(collection(db, "conversations"), where("participants", "array-contains", l), orderBy("lastMessageAt", "desc"), limit(30)),
        (s) => setConvos((prev) => {
          const m = new Map(prev.map((c) => [c.id, c]));
          s.docs.forEach((d) => m.set(d.id, { id: d.id, ...d.data() }));
          return [...m.values()].filter((c) => c.participants.some((p) => lowers.includes(p)));
        }))
    );
    return () => unsubs.forEach((u) => u());
  }, [identities]);

  // messages
  useEffect(() => {
    if (!openId) return;
    return onSnapshot(query(collection(db, "conversations", openId, "messages"), orderBy("createdAt", "asc"), limit(200)),
      (s) => setMsgs(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [openId]);

  // profile + sessions for active identity
  useEffect(() => {
    if (!active) return;
    getDoc(doc(db, "chat_profiles", active)).then((s) => {
      if (s.exists()) setProfile({ bio: "", status: "", avatarUrl: "", coverUrl: "", ...s.data() });
    }).catch(() => {});
    onSnapshot(query(collection(db, "chat_sessions"), where("usernameLower", "==", active), limit(10)),
      (s) => setSessions(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [active]);

  // register this device session
  useEffect(() => {
    if (!uid || !active) return;
    const info = `${navigator.platform} · ${navigator.userAgent.slice(0, 60)}`;
    setDoc(doc(collection(db, "chat_sessions")), {
      uid, usernameLower: active, device: info, lastActive: serverTimestamp(),
    }).catch(() => {});
  }, [uid, active]);

  const doSearch = async () => {
    const r = await fetch(`/api/chat/search?q=${encodeURIComponent(q)}`).then((x) => x.json());
    setResults(r.items || []);
  };

  const createUsername = async () => {
    setErr("");
    const r = await fetch("/api/chat/usernames", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, username: newUsername }),
    }).then((x) => x.json());
    if (r.error) return setErr(r.error);
    setNewUsername("");
    const d = await fetch(`/api/chat/usernames?uid=${uid}`).then((x) => x.json());
    setIdentities(d.items || []);
  };

  const deleteUsername = async (usernameLower) => {
    if (!confirm(`Permanently delete @${usernameLower}?`)) return;
    const r = await fetch("/api/chat/usernames", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, username: usernameLower }),
    }).then((x) => x.json());
    if (r.error) return setErr(r.error);
    setIdentities((p) => p.filter((i) => i.usernameLower !== usernameLower));
  };

  const startDM = async (targetLower) => {
    if (!active || norm(targetLower) === active) return;
    // block check
    const b = await getDoc(doc(db, "chat_blocks", `${norm(targetLower)}_${active}`));
    if (b.exists()) return setErr("You are blocked by this user.");
    const id = dmIdFor(active, targetLower);
    const ref = doc(db, "conversations", id);
    if (!(await getDoc(ref)).exists()) {
      await setDoc(ref, {
        type: "dm", participants: [active, norm(targetLower)],
        createdBy: active, createdAt: serverTimestamp(), lastMessage: "", lastMessageAt: serverTimestamp(),
      });
    }
    setOpenId(id);
  };

  const createGroup = async () => {
    if (!groupName.trim() || !active) return;
    const r = await addDoc(collection(db, "conversations"), {
      type: "group", groupName: groupName.trim(), participants: [active],
      admins: [active], createdBy: active, createdAt: serverTimestamp(),
      lastMessage: "", lastMessageAt: serverTimestamp(),
    });
    setGroupName("");
    setOpenId(r.id);
  };

  const send = async () => {
    setErr("");
    if (!openId || !active) return;
    if (!isValidText(text)) return setErr("Message required (max 2000 chars).");
    if (containsMediaMarker(text)) return setErr("Text only — no images, voice or video.");
    const convo = convos.find((c) => c.id === openId);
    if (convo?.blocked?.includes(active)) return setErr("You are blocked in this chat.");
    const msgRef = await addDoc(collection(db, "conversations", openId, "messages"), {
      sender: active, text: text.trim(), createdAt: serverTimestamp(), deletedForEveryone: false,
    });
    await updateDoc(doc(db, "conversations", openId), {
      lastMessage: text.trim().slice(0, 120), lastMessageAt: serverTimestamp(),
    });
    // fan-out minimal notification docs
    const others = (convo?.participants || []).filter((p) => p !== active);
    await Promise.all(others.map((p) => addDoc(collection(db, "notifications"), {
      toUsername: p, fromUsername: active, kind: convo?.type === "group" ? "group" : "dm",
      title: convo?.type === "group" ? `New group message` : `New message from @${active}`,
      body: text.trim().slice(0, 120), convoId: openId, read: false, createdAt: serverTimestamp(),
    })).catch(() => {}));
    notifyPush({ event: "chat_message", convoId: openId, messageId: msgRef.id });
    setText("");
  };

  const deleteForEveryone = async (m) => {
    await updateDoc(doc(db, "conversations", openId, "messages", m.id), {
      text: "— message deleted —", deletedForEveryone: true,
    });
  };
  const blockUser = async (targetLower) => {
    await setDoc(doc(db, "chat_blocks", `${active}_${norm(targetLower)}`), {
      blocker: active, blocked: norm(targetLower), createdAt: serverTimestamp(),
    });
    const c = convos.find((x) => x.id === openId);
    if (c) await updateDoc(doc(db, "conversations", openId), { blocked: [...(c.blocked || []), norm(targetLower)] });
  };
  const reportUser = async (targetLower) => {
    const reason = prompt("Reason for report?");
    if (!reason) return;
    await addDoc(collection(db, "chat_reports"), {
      reporter: active, reported: norm(targetLower), reason, createdAt: serverTimestamp(), status: "open",
    });
    alert("Report submitted.");
  };
  const saveProfile = async () => {
    await setDoc(doc(db, "chat_profiles", active), {
      ...profile, username: active, updatedAt: serverTimestamp(),
    }, { merge: true });
    alert("Profile saved.");
  };

  const open = convos.find((c) => c.id === openId);

  return (
    <div className="min-h-screen w-full bg-[#0B1220] text-white px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <h1 className="text-2xl font-black italic uppercase mb-1">Chats <span className="text-[#8B1E3F]">· usernames</span></h1>
      <p className="text-[11px] text-white/50 font-bold mb-4 uppercase">Text only — no images, voice or video calls.</p>
      {err && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold p-3 rounded-xl mb-3">{err}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="space-y-4 lg:col-span-3">
          {/* identities */}
          <div className="bg-[#142036] rounded-2xl p-4 border border-white/5">
            <p className="text-[10px] font-black uppercase text-white/40 mb-2">Chat as</p>
            <div className="flex flex-wrap gap-2">
              {identities.map((i) => (
                <div key={i.usernameLower} className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold border ${active === i.usernameLower ? "bg-[#2457D6] border-[#2457D6]" : "bg-black/30 border-white/10"}`}>
                  <button onClick={() => setActive(i.usernameLower)}>@{i.username}</button>
                  {!i.isDefault && <button onClick={() => deleteUsername(i.usernameLower)} className="text-red-400 ml-1" title="Delete permanently">×</button>}
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="new username ($1 after first)"
                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none" />
              <button onClick={createUsername} className="bg-[#2457D6] px-4 rounded-xl text-xs font-black uppercase">Buy</button>
            </div>
            <p className="text-[10px] text-white/40 mt-2">First extra username free · then $1 from wallet · 8mo+ accounts get 100 free · agents get 5 free. To use another account&apos;s username, log in with that account&apos;s email + password + OTP on the login page first.</p>
          </div>
          {/* search */}
          <div className="bg-[#142036] rounded-2xl p-4 border border-white/5">
            <p className="text-[10px] font-black uppercase text-white/40 mb-2">Search · phone / username / name / country / referrer</p>
            <div className="flex gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none" placeholder="e.g. john, +44..., NG" />
              <button onClick={doSearch} className="bg-white/10 px-4 rounded-xl text-xs font-black uppercase">Go</button>
            </div>
            {results.map((r) => {
              const uname = (r.usernameLower || r.username || "").toLowerCase();
              return (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div className="text-xs"><b>@{r.username || r.usernameLower || r.id.slice(0, 8)}</b>
                    <span className="text-white/40"> · {r.fullName || r.country || r.phone || r.kind}</span></div>
                  {uname && <button onClick={() => startDM(uname)} className="text-[11px] bg-[#2457D6] px-3 py-1.5 rounded-lg font-black uppercase">Chat</button>}
                </div>
              );
            })}
          </div>
          {/* profile */}
          <div className="bg-[#142036] rounded-2xl p-4 border border-white/5">
            <p className="text-[10px] font-black uppercase text-white/40 mb-2">Profile · @{active || "…"}</p>
            <input value={profile.avatarUrl} onChange={(e) => setProfile({ ...profile, avatarUrl: e.target.value })} placeholder="Profile picture URL" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs mb-2 outline-none" />
            <input value={profile.coverUrl} onChange={(e) => setProfile({ ...profile, coverUrl: e.target.value })} placeholder="Cover photo URL" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs mb-2 outline-none" />
            <input value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} placeholder="Bio" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs mb-2 outline-none" />
            <input value={profile.status} onChange={(e) => setProfile({ ...profile, status: e.target.value })} placeholder="Status update" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs mb-2 outline-none" />
            <button onClick={saveProfile} className="w-full bg-white/10 py-2 rounded-xl text-[11px] font-black uppercase">Save profile</button>
            <p className="text-[10px] text-white/40 mt-2 font-bold uppercase">Devices logged in as @{active}</p>
            {sessions.map((s) => <p key={s.id} className="text-[11px] text-white/60 truncate">{s.device}</p>)}
          </div>
        </div>

        {/* convo list */}
        <div className="bg-[#142036] rounded-2xl p-4 border border-white/5 lg:col-span-3">
          <p className="text-[10px] font-black uppercase text-white/40 mb-2">Conversations</p>
          <div className="flex gap-2 mb-3">
            <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="New group name" className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none" />
            <button onClick={createGroup} className="bg-[#8B1E3F] px-3 rounded-xl text-[11px] font-black uppercase">+ Group</button>
          </div>
          {convos.map((c) => (
            <button key={c.id} onClick={() => setOpenId(c.id)} className={`w-full text-left p-3 rounded-xl mb-1 ${openId === c.id ? "bg-[#2457D6]/20 border border-[#2457D6]/40" : "bg-black/20 border border-white/5"}`}>
              <p className="text-xs font-black">{c.type === "group" ? c.groupName : c.participants.filter((p) => p !== active).map((p) => `@${p}`).join(", ")}</p>
              <p className="text-[11px] text-white/40 truncate">{c.lastMessage || "—"}</p>
            </button>
          ))}
          {!convos.length && <p className="text-xs text-white/30">No chats yet — search someone above.</p>}
        </div>

        {/* thread */}
        <div className="bg-[#142036] rounded-2xl p-4 border border-white/5 flex flex-col min-h-[60vh] lg:col-span-6 lg:min-h-[calc(100vh-9rem)]">
          <p className="text-[10px] font-black uppercase text-white/40 mb-2">
            {open ? (open.type === "group" ? open.groupName : `Private · ${open.participants.filter((p) => p !== active).join(", ")}`) : "Thread"}
          </p>
          {open && open.type === "dm" && (
            <div className="flex gap-2 mb-2">
              {open.participants.filter((p) => p !== active).map((p) => (
                <div key={p} className="flex gap-1">
                  <button onClick={() => blockUser(p)} className="text-[10px] bg-red-500/20 text-red-400 px-2 py-1 rounded-lg font-black uppercase">Block</button>
                  <button onClick={() => reportUser(p)} className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-1 rounded-lg font-black uppercase">Report</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex-1 space-y-2 overflow-y-auto max-h-[50vh] lg:max-h-[calc(100vh-16rem)] mb-3">
            {msgs.map((m) => (
              <div key={m.id} className={`p-2.5 rounded-xl text-xs max-w-[90%] ${m.sender === active ? "bg-[#2457D6] ml-auto" : "bg-black/40"}`}>
                <p className="text-[9px] opacity-60 font-black">@{m.sender}</p>
                <p>{m.text}</p>
                {m.sender === active && !m.deletedForEveryone && (
                  <button onClick={() => deleteForEveryone(m)} className="text-[9px] opacity-60 underline mt-1">Delete for everyone</button>
                )}
              </div>
            ))}
          </div>
          {open && (
            <div className="flex gap-2">
              <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Type a text message…" className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none" />
              <button onClick={send} className="bg-[#2457D6] px-5 rounded-xl text-xs font-black uppercase">Send</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
