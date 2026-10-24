"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection, doc, query, where, orderBy, limit, onSnapshot,
  addDoc, setDoc, updateDoc, arrayUnion,
  serverTimestamp,
} from "firebase/firestore";
import { norm, isValidText, containsMediaMarker, dmIdFor } from "@/lib/chat";
import { notifyPush } from "@/lib/pushClient";
import { authFetch } from "@/lib/authFetch";
import ChatRoom from "@/components/chat/ChatRoom";
import PlayerSearch from "@/components/chat/PlayerSearch";
import Avatar from "@/components/Avatar";
import MessageBubble, { ComposerBanner, startsRun } from "@/components/chat/MessageBubble";
import { Ban, Flag, MoreHorizontal } from "lucide-react";

export default function ChatPage() {
  const router = useRouter();
  const [uid, setUid] = useState(null);
  const [identities, setIdentities] = useState([]);
  const [active, setActive] = useState(""); // usernameLower sending as
  const [convos, setConvos] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [groupName, setGroupName] = useState("");
  const [memberName, setMemberName] = useState("");
  const [err, setErr] = useState("");
  const [replyTo, setReplyTo] = useState(null); // private thread: message being replied to
  const [editing, setEditing] = useState(null); // private thread: own message being edited
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const threadInputRef = useRef(null);
  const [tab, setTab] = useState("room"); // "room" = public chatroom, "private" = 1-to-1 chats & groups
  const [blockedNames, setBlockedNames] = useState([]);

  // /chat?tab=private opens straight on private chats (e.g. from a push notification).
  // Read after mount (the server render has no URL); deferred so it isn't a synchronous effect update.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") !== "private") return;
    const t = setTimeout(() => setTab("private"), 0);
    return () => clearTimeout(t);
  }, []);

  // Usernames the active identity has blocked: hidden in the public chatroom.
  useEffect(() => {
    if (!active) return;
    return onSnapshot(
      query(collection(db, "chat_blocks"), where("blocker", "==", active)),
      (s) => setBlockedNames(s.docs.map((d) => d.data().blocked)),
      () => setBlockedNames([])
    );
  }, [active]);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    if (!u) return router.push("/login");
    setUid(u.uid);
  }), [router]);

  // my identities
  useEffect(() => {
    if (!uid) return;
    authFetch("/api/chat/usernames").then((d) => {
      setIdentities(d.items || []);
      if (!active && d.items?.length) setActive(d.items.find((x) => x.isDefault)?.usernameLower || d.items[0].usernameLower);
    }).catch(() => {});
  }, [uid]); // eslint-disable-line

  // my conversations — one listener by account; Firestore rules only return
  // conversations whose participantUids include me.
  useEffect(() => {
    if (!uid || !identities.length) return;
    const lowers = identities.map((i) => i.usernameLower);
    return onSnapshot(
      query(collection(db, "conversations"), where("participantUids", "array-contains", uid), orderBy("lastMessageAt", "desc"), limit(50)),
      (s) => setConvos(
        s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => (c.participants || []).some((p) => lowers.includes(p)))
      ),
      (e) => setErr(`Could not load conversations: ${e.message}`)
    );
  }, [uid, identities]);

  // messages
  useEffect(() => {
    if (!openId) return;
    return onSnapshot(query(collection(db, "conversations", openId, "messages"), orderBy("createdAt", "asc"), limit(200)),
      (s) => setMsgs(s.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }))));
  }, [openId]);

  // register this device session (listed under Settings → Chat profile)
  useEffect(() => {
    if (!uid || !active) return;
    const info = `${navigator.platform} · ${navigator.userAgent.slice(0, 60)}`;
    setDoc(doc(collection(db, "chat_sessions")), {
      uid, usernameLower: active, device: info, lastActive: serverTimestamp(),
    }).catch(() => {});
  }, [uid, active]);

  const createUsername = async () => {
    setErr("");
    const r = await authFetch("/api/chat/usernames", { method: "POST", body: { username: newUsername } });
    if (r.error) return setErr(r.error);
    setNewUsername("");
    const d = await authFetch("/api/chat/usernames");
    setIdentities(d.items || []);
  };

  const deleteUsername = async (usernameLower) => {
    if (!confirm(`Permanently delete @${usernameLower}?`)) return;
    const r = await authFetch("/api/chat/usernames", { method: "DELETE", body: { username: usernameLower } });
    if (r.error) return setErr(r.error);
    setIdentities((p) => p.filter((i) => i.usernameLower !== usernameLower));
  };

  // Conversations are created server-side (it checks blocks and records participantUids).
  const startDM = async (targetLower) => {
    setErr("");
    if (!active || norm(targetLower) === active) return;
    const r = await authFetch("/api/chat/conversations", { method: "POST", body: { action: "dm", as: active, target: targetLower } });
    if (r.error) return setErr(r.error);
    setOpenId(r.id);
  };

  const createGroup = async () => {
    setErr("");
    if (!groupName.trim() || !active) return;
    const r = await authFetch("/api/chat/conversations", { method: "POST", body: { action: "group", as: active, name: groupName } });
    if (r.error) return setErr(r.error);
    setGroupName("");
    setOpenId(r.id);
  };

  const addMember = async () => {
    setErr("");
    if (!openId || !memberName.trim()) return;
    const r = await authFetch("/api/chat/conversations", {
      method: "POST",
      body: { action: "addMember", convoId: openId, as: active, username: memberName.replace(/^@/, "") },
    });
    if (r.error) return setErr(r.error);
    setMemberName("");
  };

  const send = async () => {
    setErr("");
    if (!openId || !active) return;
    if (!isValidText(text)) return setErr("Message required (max 2000 chars).");
    if (containsMediaMarker(text)) return setErr("Text only — no images, voice or video.");
    const convo = convos.find((c) => c.id === openId);
    if (convo?.blocked?.includes(active)) return setErr("You are blocked in this chat.");
    const body = text.trim();
    // Clear the composer right away; put things back if the write fails.
    setText("");
    if (editing) {
      const target = editing;
      setEditing(null);
      await updateDoc(doc(db, "conversations", openId, "messages", target.id), {
        text: body, editedAt: serverTimestamp(),
      }).catch((e) => {
        setEditing(target);
        setText(body);
        setErr(`Could not save the edit: ${e.message}`);
      });
      return;
    }
    const quoted = replyTo;
    const quote = quoted ? { replyTo: { id: quoted.id, sender: quoted.sender, text: String(quoted.text || "").slice(0, 140) } } : {};
    setReplyTo(null);
    let msgRef;
    try {
      msgRef = await addDoc(collection(db, "conversations", openId, "messages"), {
        sender: active, text: body, createdAt: serverTimestamp(), deletedForEveryone: false, ...quote,
      });
    } catch (e) {
      setReplyTo(quoted);
      setText(body);
      return setErr(`Could not send: ${e.message}`);
    }
    await updateDoc(doc(db, "conversations", openId), {
      lastMessage: body.slice(0, 120), lastMessageAt: serverTimestamp(),
    }).catch(() => null);
    // fan-out minimal notification docs
    const others = (convo?.participants || []).filter((p) => p !== active);
    // .catch belongs on each write (it used to sit on the array, which threw and
    // skipped the push + input reset below).
    await Promise.all(others.map((p) => addDoc(collection(db, "notifications"), {
      toUsername: p, fromUsername: active, kind: convo?.type === "group" ? "group" : "dm",
      title: convo?.type === "group" ? `New group message` : `New message from @${active}`,
      body: body.slice(0, 120), convoId: openId, read: false, createdAt: serverTimestamp(),
    }).catch(() => null)));
    notifyPush({ event: "chat_message", convoId: openId, messageId: msgRef.id });
  };

  const openConversation = (id) => {
    setOpenId(id);
    setReplyTo(null);
    setEditing(null);
    setChatMenuOpen(false);
  };
  const startReply = (m) => {
    setEditing(null);
    setReplyTo(m);
    threadInputRef.current?.focus();
  };
  const startEdit = (m) => {
    setReplyTo(null);
    setEditing(m);
    setText(m.text);
    threadInputRef.current?.focus();
  };
  const cancelThreadMode = () => {
    if (editing) setText("");
    setReplyTo(null);
    setEditing(null);
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
    // Recorded on the conversation too: the rules refuse new messages from anyone listed in `blocked`.
    if (c) await updateDoc(doc(db, "conversations", openId), { blocked: arrayUnion(norm(targetLower)) });
  };
  const reportUser = async (targetLower) => {
    const reason = prompt("Reason for report?");
    if (!reason) return;
    await addDoc(collection(db, "chat_reports"), {
      reporter: active, reported: norm(targetLower), reason, createdAt: serverTimestamp(), status: "open",
    });
    alert("Report submitted.");
  };
  const reportRoomMessage = async (m) => {
    const reason = prompt(`Report @${m.sender}'s message? Tell us why:`);
    if (!reason) return;
    await addDoc(collection(db, "chat_reports"), {
      reporter: active, reported: m.sender, reason, room: "public", messageId: m.id,
      messageText: String(m.text || "").slice(0, 500), createdAt: serverTimestamp(), status: "open",
    }).catch((e) => setErr(`Could not send the report: ${e.message}`));
    alert("Report submitted.");
  };
  const messagePrivately = async (targetLower) => {
    await startDM(targetLower);
    setTab("private");
  };

  const open = convos.find((c) => c.id === openId);

  // "Chat as" identity picker — shown on both tabs.
  const identityCard = (
    <div className="bg-[#142036] rounded-2xl p-4 border border-white/5">
        <p className="text-[10px] font-black uppercase text-white/40 mb-2">Chat as</p>
        <div className="flex flex-wrap gap-2">
          {identities.map((i) => (
            <div key={i.usernameLower} className={`flex items-center gap-1 pl-1.5 pr-3 py-1.5 rounded-xl text-xs font-bold border ${active === i.usernameLower ? "bg-[#8B1E3F] border-[#8B1E3F]" : "bg-black/30 border-white/10"}`}>
              <button onClick={() => setActive(i.usernameLower)} className="flex items-center gap-1.5">
                <Avatar username={i.usernameLower} size={22} rounded="rounded-lg" />@{i.username}
              </button>
              {!i.isDefault && <button onClick={() => deleteUsername(i.usernameLower)} className="text-red-400 ml-1" title="Delete permanently">×</button>}
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="new username ($1 after first)"
            className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm outline-none" />
          <button onClick={createUsername} className="shrink-0 bg-[#8B1E3F] px-4 rounded-xl text-xs font-black uppercase">Buy</button>
        </div>
        <p className="text-[10px] text-white/40 mt-2">First extra username free · then $1 from wallet · 8mo+ accounts get 100 free · agents get 5 free. To use another account&apos;s username, log in with that account&apos;s email + password + OTP on the login page first.</p>
        <Link href="/settings#chat-profile" className="inline-block mt-2 text-[10px] font-black uppercase text-[#E0708C] hover:underline">
          Bio, status &amp; devices → Settings
        </Link>
    </div>
  );


  return (
    <div className="min-h-screen w-full bg-[#0B1220] text-white px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <h1 className="text-2xl font-black italic uppercase mb-1">Chats</h1>
      <p className="text-[11px] text-white/50 font-bold mb-4 uppercase">Text only — no images, voice or video calls.</p>

      <div className="inline-flex bg-[#142036] border border-white/5 rounded-2xl p-1 mb-4" role="tablist">
        {[["room", "Chatroom"], ["private", "Private"]].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition ${tab === key ? "bg-[#8B1E3F] text-white" : "text-white/50 hover:text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {err && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold p-3 rounded-xl mb-3">{err}</div>}

      {tab === "room" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-3">{identityCard}</div>
          <div className="lg:col-span-9">
            <ChatRoom
              uid={uid}
              active={active}
              blocked={blockedNames}
              onMessagePrivately={messagePrivately}
              onReport={reportRoomMessage}
            />
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="space-y-4 lg:col-span-3">
          {identityCard}
          <PlayerSearch onPick={startDM} />
        </div>

        {/* convo list */}
        <div className="bg-[#142036] rounded-2xl p-4 border border-white/5 lg:col-span-3">
          <p className="text-[10px] font-black uppercase text-white/40 mb-2">Conversations</p>
          <div className="flex gap-2 mb-3">
            <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="New group name" className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none" />
            <button onClick={createGroup} className="shrink-0 whitespace-nowrap bg-[#8B1E3F] px-3 rounded-xl text-[11px] font-black uppercase">+ Group</button>
          </div>
          {convos.map((c) => {
            const others = (c.participants || []).filter((p) => p !== active);
            return (
              <button key={c.id} onClick={() => openConversation(c.id)} className={`w-full flex items-center gap-2.5 text-left p-3 rounded-xl mb-1 ${openId === c.id ? "bg-[#8B1E3F]/20 border border-[#8B1E3F]/50" : "bg-black/20 border border-white/5"}`}>
                {c.type === "group" ? (
                  <span className="w-9 h-9 shrink-0 rounded-xl bg-[#2457D6]/30 flex items-center justify-center text-xs font-black">#</span>
                ) : (
                  <Avatar username={others[0]} size={36} />
                )}
                <span className="min-w-0">
                  <p className="text-xs font-black truncate">{c.type === "group" ? c.groupName : others.map((p) => `@${p}`).join(", ")}</p>
                  <p className="text-[11px] text-white/40 truncate">{c.lastMessage || "—"}</p>
                </span>
              </button>
            );
          })}
          {!convos.length && <p className="text-xs text-white/30">No chats yet — search someone above.</p>}
        </div>

        {/* thread */}
        <div className="bg-[#142036] rounded-2xl p-4 border border-white/5 flex flex-col min-h-[60vh] lg:col-span-6 lg:min-h-[calc(100vh-9rem)]">
          <div className="relative flex items-center justify-between gap-2 mb-2">
            <p className="text-[10px] font-black uppercase text-white/40 truncate">
              {open ? (open.type === "group" ? `${open.groupName} · ${(open.participants || []).length} members` : `Private · ${open.participants.filter((p) => p !== active).join(", ")}`) : "Thread"}
            </p>
            {open && (
              <button
                type="button"
                aria-label="Chat options"
                aria-expanded={chatMenuOpen}
                onClick={() => setChatMenuOpen((v) => !v)}
                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white bg-white/5 hover:bg-white/10"
              >
                <MoreHorizontal size={16} />
              </button>
            )}
            {open && chatMenuOpen && (
              <div className="absolute right-0 top-10 z-30 w-72 p-2 rounded-xl bg-[#0F1A2E] border border-white/10 shadow-2xl">
                {open.type === "group" ? (
                  <div className="p-1.5 space-y-2">
                    <p className="text-[10px] font-black uppercase text-white/40">Members</p>
                    <p className="text-xs text-white/70 break-words">{(open.participants || []).map((p) => `@${p}`).join(", ")}</p>
                    {(open.admins || []).includes(active) && (
                      <div className="flex gap-2">
                        <input value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="Add member by @username"
                          className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs outline-none" />
                        <button onClick={addMember} className="shrink-0 bg-[#8B1E3F] px-3 rounded-lg text-[11px] font-black uppercase">Add</button>
                      </div>
                    )}
                  </div>
                ) : (
                  open.participants.filter((p) => p !== active).map((p) => (
                    <div key={p}>
                      <button onClick={() => { setChatMenuOpen(false); blockUser(p); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-[13px] font-semibold text-red-300 hover:bg-white/5">
                        <Ban size={15} /> Block @{p}
                      </button>
                      <button onClick={() => { setChatMenuOpen(false); reportUser(p); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-[13px] font-semibold text-red-300 hover:bg-white/5">
                        <Flag size={15} /> Report @{p}
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto max-h-[50vh] lg:max-h-[calc(100vh-16rem)] px-1 md:px-10 pb-2 mb-2">
            {msgs.map((m, i) => {
              const mine = m.sender === active;
              return (
                <MessageBubble
                  key={m.id}
                  message={m}
                  mine={mine}
                  first={startsRun(msgs[i - 1], m)}
                  onReply={open?.blocked?.includes(active) ? undefined : startReply}
                  onEdit={startEdit}
                  onDelete={mine ? deleteForEveryone : undefined}
                  onMessagePrivately={open?.type === "group" ? startDM : undefined}
                  onReport={(msg) => reportUser(msg.sender)}
                />
              );
            })}
          </div>
          {open && <ComposerBanner mode={editing ? "edit" : replyTo ? "reply" : null} message={editing ?? replyTo} onCancel={cancelThreadMode} />}
          {open && (
            <div className="flex gap-2">
              <input ref={threadInputRef} value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") send(); else if (e.key === "Escape") cancelThreadMode(); }}
                placeholder="Type a text message…" className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none" />
              <button onClick={send} className="shrink-0 bg-[#8B1E3F] px-5 rounded-xl text-xs font-black uppercase">{editing ? "Save" : "Send"}</button>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
