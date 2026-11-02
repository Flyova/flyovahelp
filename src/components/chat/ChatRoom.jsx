"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ban, Search, VolumeX } from "lucide-react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/authFetch";
import { CHAT_SANCTION_LENGTHS, chatSanctionLabel, containsMediaMarker, formatCount } from "@/lib/chat";
import { playChatSound, playCoinSound } from "@/lib/chatSound";
import ChatMessages from "@/components/chat/ChatMessages";
import PinnedBar from "@/components/chat/PinnedBar";
import useChatSanctions from "@/components/chat/useChatSanctions";
import ChatComposer from "@/components/chat/ChatComposer";
import { useChat } from "@/components/chat/ChatProvider";
import ChatSearchSheet from "@/components/chat/ChatSearchSheet";

const MAX_LENGTH = 500;
const STATS_EVERY_MS = 60000;
const FRESH_MS = 800; // messages that arrived this recently animate in

/**
 * Public chatroom: one room for every signed-in player. Reading is live from
 * Firestore; sending, editing and deleting go through /api/chat/room (rate limits,
 * bans). Tap (or right-click) a message for its menu, swipe left to reply. Posting as
 * STRAWINS (the Chatroom's admin, lib/chat ROOM_ADMIN) adds Delete, Pin and Mute to
 * everyone's messages; its pinned messages show in a bar on top.
 * `sound`: play the new-message sound when someone else posts.
 */
export default function ChatRoom({ uid, active, blocked = [], sound = true, onMessagePrivately, onReport, onOpenProfile, onSendCoins, onBlock }) {
  const { confirmAction, ask, toneFor } = useChat();
  const [messages, setMessages] = useState([]);
  const [outbox, setOutbox] = useState([]); // your messages on their way: shown at once, with a clock
  const [searching, setSearching] = useState(false);
  const [focus, setFocus] = useState(null); // { id } of a message to scroll to (from search)
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const inputRef = useRef(null);
  // A restriction from Chats or a Chatroom mute: no posting or editing (the server checks too).
  const { roomBlocked } = useChatSanctions(uid);
  const [stats, setStats] = useState(null); // { members, online, admin }: admin = you're posting as the Chatroom's admin
  const [pins, setPins] = useState([]);
  const [burst, setBurst] = useState(null); // coins-sent animation
  const clearBurst = useCallback(() => setBurst(null), []);
  const soundRef = useRef(sound);
  const tonesRef = useRef({ message: "", coins: "" }); // the sounds picked in Chat settings
  const activeRef = useRef(active);
  useEffect(() => {
    soundRef.current = sound;
    tonesRef.current = { message: toneFor("room"), coins: toneFor("coins") };
    activeRef.current = active;
  }, [sound, toneFor, active]);

  useEffect(() => {
    if (!uid) return;
    const arrived = new Map(); // id -> when it first arrived after the initial load
    let initial = true;
    return onSnapshot(
      query(collection(db, "chatroom_messages"), orderBy("createdAt", "desc"), limit(100)),
      (s) => {
        const now = Date.now();
        const added = initial ? [] : s.docChanges().filter((c) => c.type === "added");
        added.forEach((c) => arrived.set(c.doc.id, now));
        const coinCard = added.map((c) => c.doc).find((d) => d.data().kind === "coins");
        if (coinCard) {
          const d = coinCard.data();
          setBurst({ id: coinCard.id, coins: d.coins, to: d.to, forYou: d.to === activeRef.current });
          if (soundRef.current) playCoinSound(tonesRef.current.coins);
        } else if (soundRef.current && added.some((c) => c.doc.data().senderUid !== uid)) {
          playChatSound(tonesRef.current.message);
        }
        initial = false;
        setMessages(
          s.docs.map((d) => ({ id: d.id, ...d.data(), fresh: now - (arrived.get(d.id) ?? 0) < FRESH_MS })).reverse()
        );
        setLoaded(true);
      },
      (e) => {
        setLoaded(true);
        setError(`Could not load the chatroom: ${e.message}`);
      }
    );
  }, [uid]);

  // How many players are in the Chatroom (everyone with a chat username) and online now,
  // and whether the username you're posting as is the Chatroom's admin.
  useEffect(() => {
    if (!uid) return;
    const load = () => authFetch(`/api/chat/room?as=${encodeURIComponent(active || "")}`).then((r) => !r.error && setStats(r)).catch(() => {});
    load();
    const t = setInterval(load, STATS_EVERY_MS);
    return () => clearInterval(t);
  }, [uid, active]);
  const roomAdmin = !!stats?.admin;

  // The Chatroom admin's pinned messages, newest pin first.
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(query(collection(db, "chatroom_messages"), where("pinned", "==", true)), (s) => {
      setPins(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => !m.deletedForEveryone).sort((a, b) => (b.pinnedAt || 0) - (a.pinnedAt || 0)));
    }, () => {});
  }, [uid]);

  // Sent messages stay in the outbox until the real one arrives from the server.
  const visible = useMemo(() => {
    const arrived = new Set(messages.map((m) => m.id));
    return [
      ...messages.filter((m) => !blocked.includes(m.sender)),
      ...outbox.filter((m) => !m.serverId || !arrived.has(m.serverId)),
    ];
  }, [messages, blocked, outbox]);
  // People to suggest for @mentions: whoever posted recently.
  const recentPosters = useMemo(
    () => [...new Set(messages.slice(-60).reverse().map((m) => m.sender).filter((n) => n && n !== active))],
    [messages, active]
  );

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

  const send = async () => {
    setError("");
    const body = text.trim();
    if (!active) return setError("Pick or claim a username before posting.");
    if (!body) return;
    if (body.length > MAX_LENGTH) return setError(`Keep it under ${MAX_LENGTH} characters.`);
    if (containsMediaMarker(body)) return setError("Text only — no images, voice or video.");
    // Sending an edit with the text unchanged just leaves edit mode: no "edited" label.
    if (editing && body === String(editing.text || "").trim()) {
      setText("");
      setEditing(null);
      return;
    }
    if (editing) {
      setSending(true);
      const r = await authFetch("/api/chat/room", { method: "POST", body: { action: "edit", id: editing.id, text: body } });
      setSending(false);
      if (r.error) return setError(r.error);
      setText("");
      setEditing(null);
      return;
    }
    // Show it straight away; the server's copy replaces it when it arrives.
    const quoted = replyTo;
    const local = {
      id: `local-${Date.now()}`,
      sender: active,
      senderName: active,
      senderUid: uid,
      text: body,
      createdAtMs: Date.now(),
      pending: true,
      fresh: true,
      ...(quoted ? { replyTo: { id: quoted.id, sender: quoted.sender, text: String(quoted.text || "").slice(0, 140) } } : {}),
    };
    setOutbox((o) => [...o, local]);
    setText("");
    setReplyTo(null);
    const r = await authFetch("/api/chat/room", { method: "POST", body: { action: "send", as: active, text: body, ...(quoted ? { replyTo: quoted.id } : {}) } })
      .catch((e) => ({ error: e.message }));
    if (r.error) {
      setOutbox((o) => o.filter((m) => m.id !== local.id));
      setText((cur) => cur || body);
      setReplyTo(quoted);
      return setError(r.error);
    }
    setOutbox((o) => o.map((m) => (m.id === local.id ? { ...m, serverId: r.id } : m)));
    // Once the real one is in the list (or after a while anyway), drop the copy.
    setTimeout(() => setOutbox((o) => o.filter((m) => m.id !== local.id)), 15000);
  };

  // Other people's messages are deleted only by the Chatroom's admin (the server re-checks).
  const remove = async (m) => {
    const mine = m.senderUid === uid;
    if (!mine && !(await confirmAction({ title: "Delete this message?", message: `@${m.sender}'s message is removed for everyone.`, confirmLabel: "Delete" }))) return;
    const r = await authFetch("/api/chat/room", { method: "POST", body: { action: "delete", id: m.id, ...(mine ? {} : { as: active }) } });
    if (r.error) setError(r.error);
  };
  const togglePin = async (m, pin) => {
    setError("");
    const r = await authFetch("/api/chat/room", { method: "POST", body: { action: "pin", id: m.id, as: active, pin } });
    if (r.error) setError(r.error);
  };
  const mute = async (m) => {
    const days = await ask({
      title: `Mute @${m.sender} in the Chatroom?`,
      message: "They can still read, but can't post or edit until it ends.",
      actions: CHAT_SANCTION_LENGTHS.map((d) => ({ label: chatSanctionLabel(d), value: d ?? "forever", tone: d ? "primary" : "danger" })),
    });
    if (days === null) return;
    setError("");
    const r = await authFetch("/api/chat/room", { method: "POST", body: { action: "mute", id: m.id, as: active, days: days === "forever" ? null : days } });
    if (r.error) setError(r.error);
  };
  const pinnedIds = new Set(pins.map((p) => p.id));

  return (
    // Sized to the visible screen (minus the app header from md up, the Chats title, tabs and identity bar) so the composer never hides.
    <div className="bg-[#142036] rounded-2xl border border-white/5 overflow-hidden flex flex-col h-[calc(100dvh-14rem)] min-h-[340px] md:h-[calc(100dvh-19.5rem)] lg:h-[calc(100vh-14.5rem)] lg:min-h-[520px]">
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-white/5">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase text-white/40 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 sw-live" /> Chatroom
            {stats && (
              <span className="normal-case font-bold tracking-normal text-white/55">
                · {formatCount(stats.members)} member{stats.members === 1 ? "" : "s"} · <span className="text-emerald-400">{formatCount(stats.online)} online</span>
              </span>
            )}
          </p>
          <p className="text-[11px] text-white/50 mt-0.5">Be kind. Tap a message for options, swipe left to reply.</p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <span className="hidden sm:block text-[10px] font-black uppercase text-white/40 text-right">{active ? `Posting as @${active}` : "No username yet"}</span>
          <button
            type="button"
            onClick={() => setSearching(true)}
            aria-label="Search the Chatroom"
            className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/80"
          >
            <Search size={16} />
          </button>
        </div>
      </div>

      <PinnedBar pins={pins} onJump={(id) => setFocus({ id })} onUnpin={roomAdmin ? (p) => togglePin(p, false) : undefined} />

      {error && <div className="mx-3 mt-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold p-2.5 rounded-xl">{error}</div>}

      <ChatMessages
        messages={visible}
        isMine={(m) => m.senderUid === uid}
        showAvatars
        showNames
        loading={!loaded}
        emptyText="No messages yet — say hello to everyone!"
        onReply={startReply}
        onEdit={roomBlocked ? undefined : startEdit}
        onDelete={remove}
        canDelete={(m) => m.senderUid === uid || roomAdmin}
        deleteLabel={(m) => (m.senderUid === uid ? "Delete for everyone" : "Delete message (admin)")}
        onPin={roomAdmin ? (m) => togglePin(m, !pinnedIds.has(m.id)) : undefined}
        isPinned={(m) => pinnedIds.has(m.id)}
        extraMenuItems={roomAdmin ? (m) => (m.senderUid && m.senderUid !== uid && !m.pending ? [{ label: `Mute @${m.sender}`, icon: VolumeX, danger: true, run: () => mute(m) }] : []) : undefined}
        onMessagePrivately={onMessagePrivately}
        onReport={onReport}
        onOpenProfile={onOpenProfile}
        onSendCoins={onSendCoins}
        onBlock={onBlock}
        burst={burst}
        onBurstDone={clearBurst}
        focus={focus}
      />

      {roomBlocked ? (
        <p className="px-4 py-3.5 border-t border-white/5 bg-[#142036] flex items-center justify-center gap-2 text-center text-[13px] text-white/60">
          <Ban size={14} className="shrink-0" /> {roomBlocked}
        </p>
      ) : (
        <ChatComposer
          value={text}
          onChange={setText}
          onSend={send}
          onCancel={cancelMode}
          mode={editing ? "edit" : replyTo ? "reply" : null}
          modeMessage={editing ?? replyTo}
          placeholder={active ? "Message everyone…" : "Claim a username to post"}
          disabled={!active}
          maxLength={MAX_LENGTH}
          sending={sending}
          inputRef={inputRef}
          mentionPeople={recentPosters}
          searchPlayers
        />
      )}

      {searching && (
        <ChatSearchSheet
          convoId="room"
          title="the Chatroom"
          isGroup
          peopleLabel="People in the Chatroom"
          members={[...new Set(messages.map((m) => m.sender).filter(Boolean))]}
          me={active}
          presenceNow={0}
          messages={visible}
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
    </div>
  );
}
