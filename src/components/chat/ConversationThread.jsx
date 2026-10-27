"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FieldPath, addDoc, collection, deleteField, doc, documentId, limitToLast, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { ChevronLeft, LockKeyhole, MoreHorizontal, Search } from "lucide-react";
import { db } from "@/lib/firebase";
import { TYPING_PING_MS, canPostInGroup, containsMediaMarker, formatCount, isValidText, presenceOf, typingLabel } from "@/lib/chat";
import { notifyPush } from "@/lib/pushClient";
import { playChatSound, playCoinSound } from "@/lib/chatSound";
import { useChat } from "@/components/chat/ChatProvider";
import ChatMessages from "@/components/chat/ChatMessages";
import { messageMillis } from "@/components/chat/MessageBubble";
import ChatComposer from "@/components/chat/ChatComposer";
import MessageMenu from "@/components/chat/MessageMenu";
import ChatSearchSheet from "@/components/chat/ChatSearchSheet";

const FRESH_MS = 800; // messages that arrived this recently animate in
const MENU_WIDTH = 228;

// Array#findLast, which older iPhones (iOS < 15.4) don't have.
const lastWhere = (list, test) => {
  for (let i = list.length - 1; i >= 0; i--) if (test(list[i])) return list[i];
  return null;
};

/**
 * One open private chat or group: header (back, avatar, name, options), the
 * live message list and the composer. Key it by conversation id.
 *
 * `me` is the username you're in this chat as. `header` = { avatar, title,
 * statusLine, subtitle, online, label, onClick }: a private chat's statusLine (the
 * other player's status) sits under the name, where a group shows its description.
 * `menuItems` fill the ⋯ menu. A group admin passes
 * `onModerate` to remove other people's messages; groups pass `onSendCoins`.
 * `blockedByMe` = { name, onUnblock } when you've blocked the other person in a
 * private chat: you can't write to them until you unblock.
 *
 * While it's open and on screen it records how far you've read (privately for
 * unread counts, and on the conversation for read receipts if you share them)
 * and that you're typing. Readers' avatars sit under the last message each has
 * seen, Messenger style.
 */
export default function ConversationThread({
  convoId,
  convo,
  me,
  isGroup,
  header,
  menuItems = [],
  onBack,
  onError,
  onModerate,
  onMessagePrivately,
  onReport,
  onOpenProfile,
  onSendCoins,
  onBlock,
  blockedByMe = null,
}) {
  const [msgs, setMsgs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [synced, setSynced] = useState(false); // messages confirmed by the server (not just this device's cache)
  const [lost, setLost] = useState(false); // removed from the chat while it was open
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [menuAt, setMenuAt] = useState(null);
  const [burst, setBurst] = useState(null); // coins-sent animation
  const clearBurst = useCallback(() => setBurst(null), []);
  const inputRef = useRef(null);
  const { uid, chatState, typingIn, soundOn, toneFor, settingsFor, presenceNow } = useChat();
  const [memberPresence, setMemberPresence] = useState({}); // group members' online status
  const [searching, setSearching] = useState(false);
  const [focus, setFocus] = useState(null); // { id } of a message to scroll to (from search)

  // Sound for messages from others arriving while this chat is open and on screen.
  const soundRef = useRef(false);
  const tonesRef = useRef({ message: "", coins: "" }); // the sounds picked in Chat settings
  const meRef = useRef(me);
  useEffect(() => {
    soundRef.current = soundOn(isGroup ? "group" : "private", convoId);
    tonesRef.current = { message: toneFor(isGroup ? "group" : "private", convoId), coins: toneFor("coins", convoId) };
    meRef.current = me;
  }, [soundOn, toneFor, isGroup, convoId, me]);
  // Where you'd read up to when the chat opened (decided once, when both your read
  // position and the messages are in): the first newer message from someone else
  // gets an "Unread messages" line, and the chat scrolls there.
  const [unreadAtOpen, setUnreadAtOpen] = useState({ decided: false, id: null });
  if (!unreadAtOpen.decided && chatState.loaded && synced) {
    const since = Math.max(chatState.reads[convoId]?.toMillis?.() ?? 0, chatState.cleared[convoId]?.toMillis?.() ?? 0);
    const first = since ? msgs.find((m) => !m.pending && m.sender && m.sender !== me && m.kind !== "system" && messageMillis(m) > since) : null;
    setUnreadAtOpen({ decided: true, id: first?.id ?? null });
  }
  const unreadFromId = unreadAtOpen.id;

  const typingSince = useRef(0); // when we last stamped "typing" (0 = not typing)
  const marked = useRef({ private: 0, shared: 0 }); // read positions already written

  // Messages — with metadata changes, so a message shows a clock until the server has it.
  useEffect(() => {
    const arrived = new Map(); // id -> when it first arrived after the initial load
    let initial = true;
    return onSnapshot(
      query(collection(db, "conversations", convoId, "messages"), orderBy("createdAt", "asc"), limitToLast(200)),
      { includeMetadataChanges: true },
      (s) => {
        const now = Date.now();
        const added = initial ? [] : s.docChanges().filter((c) => c.type === "added");
        added.forEach((c) => arrived.set(c.doc.id, now));
        const coinCard = added.map((c) => c.doc).find((d) => d.data().kind === "coins");
        const onScreen = document.visibilityState === "visible";
        if (coinCard) {
          const d = coinCard.data();
          setBurst({ id: coinCard.id, coins: d.coins, to: d.to, forYou: d.to === meRef.current });
          if (soundRef.current && onScreen) playCoinSound(tonesRef.current.coins);
        } else if (soundRef.current && onScreen && added.some((c) => c.doc.data().sender !== meRef.current)) {
          playChatSound(tonesRef.current.message);
        }
        initial = false;
        setMsgs(s.docs.map((d) => ({
          id: d.id,
          ...d.data({ serverTimestamps: "estimate" }),
          pending: d.metadata.hasPendingWrites,
          fresh: now - (arrived.get(d.id) ?? 0) < FRESH_MS,
        })));
        setLoaded(true);
        if (!s.metadata.fromCache) setSynced(true);
      },
      () => {
        setLoaded(true);
        setLost(true);
      }
    );
  }, [convoId]);

  // A chat you deleted shows only what was said after you deleted it.
  const clearedMs = chatState.cleared[convoId]?.toMillis?.() ?? 0;
  const shown = useMemo(() => (clearedMs ? msgs.filter((m) => m.pending || messageMillis(m) > clearedMs) : msgs), [msgs, clearedMs]);
  const blockedHere = !!convo?.blocked?.includes(me);
  // A locked group takes messages only from its admins.
  const lockedOut = isGroup && !!convo && !canPostInGroup(convo, me);
  const cantSend = !convo || blockedHere || lost || !!blockedByMe || lockedOut;
  // Read receipts are a setting of the chat profile you're in this chat as.
  const receipts = settingsFor(me).readReceipts;

  // "typing…": stamped at most every TYPING_PING_MS while there's text, cleared on send or leaving.
  const setTyping = useCallback((on) => {
    if (!me) return;
    const now = Date.now();
    if (on ? now - typingSince.current < TYPING_PING_MS : !typingSince.current) return;
    typingSince.current = on ? now : 0;
    updateDoc(doc(db, "conversations", convoId), new FieldPath("typing", me), on ? serverTimestamp() : deleteField(), "presenceBy", me)
      .catch(() => {});
  }, [convoId, me]);
  useEffect(() => () => setTyping(false), [setTyping]);

  // Newest message the server has (and the newest from someone else): how far you've read.
  const confirmed = useMemo(() => msgs.filter((m) => !m.pending), [msgs]);
  const latestMs = messageMillis(confirmed[confirmed.length - 1] ?? {});
  const latestOthersMs = messageMillis(lastWhere(confirmed, (m) => m.sender !== me) ?? {});
  const privateReadMs = chatState.reads[convoId]?.toMillis?.() ?? 0;
  const sharedReadMs = convo?.readAt?.[me]?.toMillis?.() ?? 0;

  useEffect(() => {
    if (!uid || !me || lost || !latestMs) return;
    const mark = () => {
      if (document.visibilityState !== "visible") return;
      if (latestMs > privateReadMs && latestMs > marked.current.private) {
        marked.current.private = latestMs;
        setDoc(doc(db, "chat_state", uid), { reads: { [convoId]: serverTimestamp() } }, { merge: true }).catch(() => {});
      }
      if (receipts && latestOthersMs > sharedReadMs && latestOthersMs > marked.current.shared) {
        marked.current.shared = latestOthersMs;
        updateDoc(doc(db, "conversations", convoId), new FieldPath("readAt", me), serverTimestamp(), "presenceBy", me).catch(() => {});
      }
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [uid, me, lost, convoId, latestMs, latestOthersMs, privateReadMs, sharedReadMs, receipts]);

  // Each other member's avatar goes under the last message they've read, unless
  // that's their own message. Hidden if you don't share read receipts yourself.
  const { seenBy, sentId } = useMemo(() => {
    if (!receipts || !convo) return { seenBy: {}, sentId: null };
    const out = {};
    for (const p of convo.participants || []) {
      const readMs = p === me ? 0 : convo.readAt?.[p]?.toMillis?.();
      const m = readMs ? lastWhere(confirmed, (x) => x.kind !== "system" && messageMillis(x) <= readMs) : null;
      if (m && m.sender !== p) (out[m.id] ||= []).push(p);
    }
    const last = msgs[msgs.length - 1];
    const sent = last && last.sender === me && !last.pending && !out[last.id] ? last.id : null;
    return { seenBy: out, sentId: sent };
  }, [receipts, convo, me, confirmed, msgs]);

  const typers = typingIn[convoId] || [];

  // Group members' online status, 30 per listener.
  const memberKey = isGroup ? [...(convo?.participants || [])].sort().join(",") : "";
  useEffect(() => {
    if (!memberKey) return;
    const names = memberKey.split(",");
    const offs = [];
    for (let i = 0; i < names.length; i += 30) {
      offs.push(onSnapshot(
        query(collection(db, "chat_presence"), where(documentId(), "in", names.slice(i, i + 30))),
        (s) => setMemberPresence((p) => {
          const next = { ...p };
          s.docs.forEach((d) => { next[d.id] = d.data(); });
          return next;
        }),
        () => {}
      ));
    }
    return () => offs.forEach((off) => off());
  }, [memberKey]);
  const members = convo?.participants || [];
  // You're here, so you count as online; everyone else by their online status.
  const onlineCount = isGroup ? 1 + members.filter((p) => p !== me && presenceOf(memberPresence[p], presenceNow)?.online).length : 0;

  const send = async () => {
    onError("");
    if (!me || cantSend) return;
    setTyping(false);
    if (!isValidText(text)) return onError("Message required (max 2000 chars).");
    if (containsMediaMarker(text)) return onError("Text only — no images, voice or video.");
    const body = text.trim();
    // Clear the composer right away; put things back if the write fails.
    setText("");
    if (editing) {
      const target = editing;
      setEditing(null);
      // Sending the text unchanged just leaves edit mode: no "edited" label.
      if (body === String(target.text || "").trim()) return;
      await updateDoc(doc(db, "conversations", convoId, "messages", target.id), {
        text: body, editedAt: serverTimestamp(),
      }).catch((e) => {
        setEditing(target);
        setText(body);
        onError(`Could not save the edit: ${e.message}`);
      });
      return;
    }
    const quoted = replyTo;
    const quote = quoted ? { replyTo: { id: quoted.id, sender: quoted.sender, text: String(quoted.text || "").slice(0, 140) } } : {};
    setReplyTo(null);
    let msgRef;
    try {
      msgRef = await addDoc(collection(db, "conversations", convoId, "messages"), {
        sender: me, text: body, createdAt: serverTimestamp(), deletedForEveryone: false, ...quote,
      });
    } catch (e) {
      setReplyTo(quoted);
      setText(body);
      return onError(`Could not send: ${e.message}`);
    }
    await updateDoc(doc(db, "conversations", convoId), {
      lastMessage: body.slice(0, 120), lastMessageAt: serverTimestamp(),
    }).catch(() => null);
    // Fan out minimal notification docs; .catch on each write so one failure can't skip the push.
    const others = (convo.participants || []).filter((p) => p !== me);
    await Promise.all(others.map((p) => addDoc(collection(db, "notifications"), {
      toUsername: p, fromUsername: me, kind: isGroup ? "group" : "dm",
      title: isGroup ? `New message in ${convo.groupName || "your group"}` : `New message from @${me}`,
      body: body.slice(0, 120), convoId, read: false, createdAt: serverTimestamp(),
    }).catch(() => null)));
    notifyPush({ event: "chat_message", convoId, messageId: msgRef.id });
  };

  const startReply = (m) => {
    setEditing(null);
    setReplyTo(m);
    inputRef.current?.focus();
  };
  const startEdit = (m) => {
    setReplyTo(null);
    setEditing(m);
    setText(m.text);
    inputRef.current?.focus();
  };
  const cancelMode = () => {
    if (editing) setText("");
    setReplyTo(null);
    setEditing(null);
  };

  const deleteMessage = async (m) => {
    if (m.kind === "system" || m.sender !== me) return onModerate?.(m);
    await updateDoc(doc(db, "conversations", convoId, "messages", m.id), {
      text: "— message deleted —", deletedForEveryone: true,
    }).catch((e) => onError(`Could not delete: ${e.message}`));
  };

  const openMenu = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenuAt({ x: r.right - MENU_WIDTH, y: r.bottom + 6 });
  };

  const typingNow = typingLabel(typers, isGroup);
  const groupLine = isGroup && convo
    ? `${formatCount(members.length)} member${members.length === 1 ? "" : "s"} · ${formatCount(onlineCount)} online · ${convo.visibility === "public" ? "public" : "private"}${convo.locked ? " · locked" : ""}`
    : "";
  const subtitle = lost
    ? "You're no longer in this chat"
    : blockedByMe
      ? `You blocked @${blockedByMe.name}`
      : blockedHere
        ? "You can no longer send messages here"
        : typingNow || groupLine || header.subtitle;
  // Under the name: a group's description, or the other player's status in a private chat.
  const aboutLine = lost ? "" : isGroup ? convo?.description : header.statusLine;

  return (
    <>
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/5">
        <button type="button" onClick={onBack} aria-label="Back to the list" className="lg:hidden shrink-0 w-9 h-9 -ml-1 rounded-xl flex items-center justify-center text-white/80 hover:bg-white/5">
          <ChevronLeft size={22} />
        </button>
        <button
          type="button"
          disabled={!convo || !header.onClick}
          onClick={header.onClick}
          aria-label={header.label}
          className="min-w-0 flex-1 flex items-center gap-2.5 text-left rounded-xl -my-1 py-1 pr-2 hover:bg-white/[0.04] transition-colors"
        >
          {header.avatar}
          <span className="min-w-0 flex-1">
            <span className={`block font-bold truncate ${isGroup ? "text-[18px] font-black leading-tight" : "text-[15px]"}`}>{convo ? header.title : lost ? "Chat unavailable" : "Loading…"}</span>
            {aboutLine && <span className={`text-[12.5px] text-white/65 ${isGroup ? "block truncate" : "line-clamp-2 break-words"}`}>{aboutLine}</span>}
            <span className={`block text-[12px] truncate ${lost || blockedHere || blockedByMe ? "text-red-300/80" : typingNow ? "text-[#E0708C]" : header.online || onlineCount > 1 ? "text-emerald-400" : "text-white/45"}`}>{convo || lost ? subtitle : ""}</span>
          </span>
        </button>
        {convo && !lost && (
          <button
            type="button"
            aria-label="Search this chat"
            onClick={() => setSearching(true)}
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white bg-white/5 hover:bg-white/10"
          >
            <Search size={16} />
          </button>
        )}
        {convo && menuItems.length > 0 && (
          <button
            type="button"
            aria-label="Chat options"
            aria-haspopup="menu"
            aria-expanded={!!menuAt}
            onClick={openMenu}
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white bg-white/5 hover:bg-white/10"
          >
            <MoreHorizontal size={17} />
          </button>
        )}
      </div>

      <ChatMessages
        messages={shown}
        isMine={(m) => m.sender === me}
        showAvatars={isGroup}
        showNames={isGroup}
        loading={!loaded}
        emptyText={lost ? "This chat isn't available to you any more." : `No messages yet. Say hello${isGroup ? " to the group" : ""}!`}
        onReply={cantSend ? undefined : startReply}
        onEdit={cantSend ? undefined : startEdit}
        onDelete={deleteMessage}
        canDelete={(m) => (m.kind !== "system" && m.sender === me) || !!onModerate}
        deleteLabel={(m) => (m.kind === "system" ? "Remove for everyone" : m.sender === me ? "Delete for everyone" : "Delete message (group admin)")}
        onMessagePrivately={onMessagePrivately}
        onReport={onReport}
        onOpenProfile={onOpenProfile}
        onSendCoins={lockedOut ? undefined : onSendCoins}
        onBlock={onBlock}
        seenBy={seenBy}
        sentId={sentId}
        typing={lost ? [] : typers}
        burst={burst}
        onBurstDone={clearBurst}
        unreadFromId={unreadFromId}
        focus={focus}
      />

      {blockedByMe ? (
        <div className="px-4 py-3 border-t border-white/5 bg-[#142036] flex items-center justify-between gap-3">
          <p className="text-[13px] text-white/60">You blocked @{blockedByMe.name}. They can&apos;t message you.</p>
          <button type="button" onClick={blockedByMe.onUnblock} className="shrink-0 h-9 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-black uppercase">
            Unblock
          </button>
        </div>
      ) : lockedOut ? (
        <p className="px-4 py-3.5 border-t border-white/5 bg-[#142036] flex items-center justify-center gap-2 text-[13px] text-white/60">
          <LockKeyhole size={14} className="shrink-0" /> Only admins can send messages
        </p>
      ) : (
        <ChatComposer
          value={text}
          onChange={(v) => {
            setText(v);
            setTyping(!!v.trim() && !editing);
          }}
          onSend={send}
          onCancel={cancelMode}
          mode={editing ? "edit" : replyTo ? "reply" : null}
          modeMessage={editing ?? replyTo}
          placeholder={lost ? "You're no longer in this chat" : blockedHere ? "You can't reply to this chat" : "Message"}
          disabled={cantSend}
          maxLength={2000}
          inputRef={inputRef}
          mentionPeople={members.filter((p) => p !== me)}
        />
      )}

      {menuAt && <MessageMenu at={menuAt} items={menuItems} onClose={() => setMenuAt(null)} />}

      {searching && (
        <ChatSearchSheet
          convoId={convoId}
          title={header.title || "chat"}
          isGroup={isGroup}
          members={members}
          me={me}
          presence={memberPresence}
          presenceNow={presenceNow}
          messages={shown}
          clearedMs={clearedMs}
          onJump={(id) => {
            setSearching(false);
            setFocus({ id });
          }}
          onOpenProfile={(p) => {
            setSearching(false);
            onOpenProfile?.(p);
          }}
          onClose={() => setSearching(false)}
        />
      )}
    </>
  );
}

/** What the thread pane shows on desktop before a chat is picked. */
export function ThreadPlaceholder({ icon: Icon, title, text }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 px-8">
      <span className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/40"><Icon size={22} /></span>
      <p className="text-sm font-bold text-white/70">{title}</p>
      <p className="text-xs text-white/40 max-w-xs">{text}</p>
    </div>
  );
}
