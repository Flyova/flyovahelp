"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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
import IdentityBar from "@/components/chat/IdentityBar";
import ConversationList from "@/components/chat/ConversationList";
import ChatMessages from "@/components/chat/ChatMessages";
import ChatComposer from "@/components/chat/ChatComposer";
import ProfileSheet from "@/components/chat/ProfileSheet";
import Avatar from "@/components/Avatar";
import { Ban, ChevronLeft, Flag, MessagesSquare, MoreHorizontal, Users, X } from "lucide-react";

const FRESH_MS = 800; // messages that arrived this recently animate in

export default function ChatPage() {
  const router = useRouter();
  const [uid, setUid] = useState(null);
  const [identities, setIdentities] = useState([]);
  const [active, setActive] = useState(""); // usernameLower sending as
  const [convos, setConvos] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [msgsFor, setMsgsFor] = useState(null); // conversation the loaded messages belong to
  const [text, setText] = useState("");
  const [memberName, setMemberName] = useState("");
  const [err, setErr] = useState("");
  const [replyTo, setReplyTo] = useState(null); // private thread: message being replied to
  const [editing, setEditing] = useState(null); // private thread: own message being edited
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const threadInputRef = useRef(null);
  const [profileOf, setProfileOf] = useState(null); // username whose profile popup is open
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

  // messages — with metadata changes, so a message shows a clock until the server has it
  useEffect(() => {
    if (!openId) return;
    const arrived = new Map(); // id -> when it first arrived after the initial load
    let initial = true;
    return onSnapshot(
      query(collection(db, "conversations", openId, "messages"), orderBy("createdAt", "asc"), limit(200)),
      { includeMetadataChanges: true },
      (s) => {
        const now = Date.now();
        if (!initial) s.docChanges().forEach((c) => c.type === "added" && arrived.set(c.doc.id, now));
        initial = false;
        setMsgs(s.docs.map((d) => ({
          id: d.id,
          ...d.data({ serverTimestamps: "estimate" }),
          pending: d.metadata.hasPendingWrites,
          fresh: now - (arrived.get(d.id) ?? 0) < FRESH_MS,
        })));
        setMsgsFor(openId);
      }
    );
  }, [openId]);

  // register this device session (listed under Settings → Chat profile)
  useEffect(() => {
    if (!uid || !active) return;
    const info = `${navigator.platform} · ${navigator.userAgent.slice(0, 60)}`;
    setDoc(doc(collection(db, "chat_sessions")), {
      uid, usernameLower: active, device: info, lastActive: serverTimestamp(),
    }).catch(() => {});
  }, [uid, active]);

  // Resolves to an error message for IdentityBar to show, or "" on success.
  const createUsername = async (username) => {
    const r = await authFetch("/api/chat/usernames", { method: "POST", body: { username } });
    if (r.error) return r.error;
    const d = await authFetch("/api/chat/usernames");
    setIdentities(d.items || []);
    return "";
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
    openConversation(r.id);
  };

  // Resolves to an error message, or "" on success.
  const createGroup = async (name) => {
    setErr("");
    if (!active) return "Claim a chat username first.";
    const r = await authFetch("/api/chat/conversations", { method: "POST", body: { action: "group", as: active, name } });
    if (r.error) {
      setErr(r.error);
      return r.error;
    }
    openConversation(r.id);
    return "";
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

  // Opens a chat (or closes it with null — the back button on phones).
  const openConversation = (id) => {
    if (id !== openId) setMsgs([]);
    setOpenId(id);
    setReplyTo(null);
    setEditing(null);
    setChatMenuOpen(false);
    if (!id) setText("");
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
    const target = norm(targetLower);
    if (!active || !confirm(`Block @${target}? They won't be able to message you, and you won't see them in the chatroom.`)) return;
    await setDoc(doc(db, "chat_blocks", `${active}_${target}`), {
      blocker: active, blocked: target, createdAt: serverTimestamp(),
    });
    // Recorded on your private chat with them too: the rules refuse new messages from anyone listed in `blocked`.
    const c = convos.find((x) => x.type !== "group" && (x.participants || []).includes(target));
    if (c) await updateDoc(doc(db, "conversations", c.id), { blocked: arrayUnion(target) });
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

  const closeProfile = useCallback(() => setProfileOf(null), []);

  const open = convos.find((c) => c.id === openId);
  const others = open ? (open.participants || []).filter((p) => p !== active) : [];
  const isGroup = open?.type === "group";
  const blockedHere = !!open?.blocked?.includes(active);
  // On phones an open private chat takes the whole screen (back button returns to the list).
  const inThread = tab === "private" && !!openId;

  const identityBar = (
    <IdentityBar identities={identities} active={active} onSelect={setActive} onCreate={createUsername} onDelete={deleteUsername} />
  );

  return (
    <div className={`min-h-screen w-full bg-[#0B1220] text-white px-4 sm:px-6 md:px-8 ${inThread ? "pt-3 pb-20 md:pb-4 lg:pt-8 lg:pb-8" : "pt-6 pb-24 md:pt-8 md:pb-8"}`}>
      <div className={inThread ? "hidden lg:block" : ""}>
        <h1 className="text-2xl font-black italic uppercase leading-none">Chats</h1>
        <p className="text-[11px] text-white/45 font-bold mt-1.5 mb-4 uppercase">Text only — no images, voice or video calls.</p>

        <div className="flex sm:inline-flex w-full sm:w-auto bg-[#142036] border border-white/5 rounded-2xl p-1 mb-4" role="tablist">
          {[["room", "Chatroom"], ["private", "Private"]].map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`flex-1 sm:flex-none px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition ${tab === key ? "bg-[#8B1E3F] text-white" : "text-white/50 hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {err && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-bold p-3 rounded-xl mb-3">
          <span className="flex-1 break-words">{err}</span>
          <button type="button" onClick={() => setErr("")} aria-label="Dismiss" className="shrink-0 text-red-300/70 hover:text-red-200"><X size={14} /></button>
        </div>
      )}

      {tab === "room" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4">
          <div className="lg:col-span-3">{identityBar}</div>
          <div className="lg:col-span-9">
            <ChatRoom
              uid={uid}
              active={active}
              blocked={blockedNames}
              onMessagePrivately={messagePrivately}
              onReport={reportRoomMessage}
              onOpenProfile={setProfileOf}
            />
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 lg:h-[calc(100vh-14.5rem)] lg:min-h-[520px]">
        {/* identity, search and inbox — hidden on phones while a chat is open */}
        <div className={`lg:col-span-4 flex-col gap-3 min-h-0 ${inThread ? "hidden lg:flex" : "flex"}`}>
          {identityBar}
          <PlayerSearch onPick={startDM} />
          <ConversationList
            className="lg:flex-1"
            convos={convos}
            active={active}
            openId={openId}
            onOpen={openConversation}
            onCreateGroup={createGroup}
          />
        </div>

        {/* thread */}
        <section className={`lg:col-span-8 bg-[#142036] rounded-2xl border border-white/5 overflow-hidden flex-col min-h-0 h-[calc(100dvh-9.25rem)] md:h-[calc(100dvh-5.25rem)] lg:h-auto ${inThread ? "flex" : "hidden lg:flex"}`}>
          {openId ? (
            <>
              <div className="relative flex items-center gap-2.5 px-3 py-2.5 border-b border-white/5">
                <button type="button" onClick={() => openConversation(null)} aria-label="Back to chats" className="lg:hidden shrink-0 w-9 h-9 -ml-1 rounded-xl flex items-center justify-center text-white/80 hover:bg-white/5">
                  <ChevronLeft size={22} />
                </button>
                {/* Tap the name: their profile (private chat) or the member list (group). */}
                <button
                  type="button"
                  disabled={!open}
                  onClick={() => (isGroup ? setChatMenuOpen((v) => !v) : others[0] && setProfileOf(others[0]))}
                  aria-label={isGroup ? "Group info" : others[0] ? `View @${others[0]}'s profile` : undefined}
                  className="min-w-0 flex-1 flex items-center gap-2.5 text-left rounded-xl -my-1 py-1 pr-2 hover:bg-white/[0.04] transition-colors"
                >
                  {isGroup ? (
                    <span className="w-10 h-10 shrink-0 rounded-full bg-[#2457D6]/25 text-[#8FB0FF] flex items-center justify-center"><Users size={18} /></span>
                  ) : (
                    others[0] && <Avatar username={others[0]} size={40} rounded="rounded-full" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold truncate">{!open ? "Loading…" : isGroup ? open.groupName : others.map((p) => `@${p}`).join(", ")}</span>
                    <span className={`block text-[12px] truncate ${blockedHere ? "text-red-300/80" : "text-white/45"}`}>
                      {blockedHere ? "You can no longer send messages here" : isGroup ? `${(open?.participants || []).length} members` : open ? "tap for profile" : ""}
                    </span>
                  </span>
                </button>
                {open && (
                  <button
                    type="button"
                    aria-label="Chat options"
                    aria-expanded={chatMenuOpen}
                    onClick={() => setChatMenuOpen((v) => !v)}
                    className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white bg-white/5 hover:bg-white/10"
                  >
                    <MoreHorizontal size={17} />
                  </button>
                )}
                {open && chatMenuOpen && (
                  <div className="absolute right-3 top-14 z-30 w-72 max-w-[calc(100%-1.5rem)] p-2 rounded-xl bg-[#0F1A2E] border border-white/10 shadow-2xl">
                    {isGroup ? (
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
                      others.map((p) => (
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

              <ChatMessages
                messages={msgsFor === openId ? msgs : []}
                isMine={(m) => m.sender === active}
                showAvatars={isGroup}
                showNames={isGroup}
                loading={msgsFor !== openId}
                emptyText={`No messages yet. Say hello${isGroup ? " to the group" : others[0] ? ` to @${others[0]}` : ""}!`}
                onReply={blockedHere ? undefined : startReply}
                onEdit={startEdit}
                onDelete={deleteForEveryone}
                canDelete={(m) => m.sender === active}
                deleteLabel={() => "Delete for everyone"}
                onMessagePrivately={isGroup ? startDM : undefined}
                onReport={(msg) => reportUser(msg.sender)}
                onOpenProfile={setProfileOf}
              />

              <ChatComposer
                value={text}
                onChange={setText}
                onSend={send}
                onCancel={cancelThreadMode}
                mode={editing ? "edit" : replyTo ? "reply" : null}
                modeMessage={editing ?? replyTo}
                placeholder={blockedHere ? "You can't reply to this chat" : "Message"}
                disabled={!open || blockedHere}
                maxLength={2000}
                inputRef={threadInputRef}
              />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 px-8">
              <span className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/40"><MessagesSquare size={22} /></span>
              <p className="text-sm font-bold text-white/70">Select a chat</p>
              <p className="text-xs text-white/40 max-w-xs">Pick a conversation on the left, or find a player to start a private chat.</p>
            </div>
          )}
        </section>
      </div>
      )}

      {profileOf && (
        <ProfileSheet
          key={profileOf}
          username={profileOf}
          onClose={closeProfile}
          onMessage={messagePrivately}
          onBlock={blockUser}
          onReport={reportUser}
        />
      )}
    </div>
  );
}
