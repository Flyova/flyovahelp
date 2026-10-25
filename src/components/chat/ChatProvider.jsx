"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  Timestamp, addDoc, arrayUnion, collection, doc, getCountFromServer, limit, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { authFetch } from "@/lib/authFetch";
import { READS_SINCE_MS, TYPING_SHOW_MS, norm } from "@/lib/chat";
import ProfileSheet from "@/components/chat/ProfileSheet";
import { CoinWalletSheet, SendCoinsSheet } from "@/components/chat/CoinSheets";

const ChatContext = createContext(null);

// The Chats pages, at /chat/<key>. /chat itself reopens the last one used.
export const CHAT_SECTIONS = [
  { key: "room", label: "Chatroom" },
  { key: "private", label: "Private" },
  { key: "groups", label: "Groups" },
];
export const LAST_SECTION_KEY = "chat:lastSection";

/** The chat state every Chats page shares; only usable inside <ChatProvider>. */
export const useChat = () => useContext(ChatContext);

const STALE_TYPING_MS = 30000; // a typing stamp this old when first seen is someone who left mid-message

// Records when each typing stamp *arrived here*, so "typing…" timing doesn't
// depend on other devices' clocks. arrivals: "<convoId>/<name>" -> { ms, at }.
function noteTypingArrivals(convos, arrivals, now) {
  const present = new Set();
  for (const c of convos) {
    for (const [name, ts] of Object.entries(c.typing || {})) {
      const key = `${c.id}/${name}`;
      const ms = ts?.toMillis?.() ?? 0;
      present.add(key);
      const prev = arrivals.get(key);
      if (prev?.ms === ms) continue;
      arrivals.set(key, { ms, at: !prev && ms && now - ms > STALE_TYPING_MS ? 0 : now });
    }
  }
  for (const key of arrivals.keys()) if (!present.has(key)) arrivals.delete(key);
}

// conversation id -> usernames typing there now (never your own).
function whoIsTyping(convos, arrivals, mine, now) {
  const out = {};
  for (const c of convos) {
    const names = Object.keys(c.typing || {})
      .filter((name) => !mine.includes(name) && now - (arrivals.get(`${c.id}/${name}`)?.at ?? 0) < TYPING_SHOW_MS);
    if (names.length) out[c.id] = names;
  }
  return out;
}

const sameTyping = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * State shared by the Chatroom, Private and Groups pages, kept while you move
 * between them: who you are (your chat usernames and the one you're using), your
 * conversations, who is typing in them and how many messages you haven't read,
 * the usernames you've blocked, the chat open on each page, and the profile
 * popup. Also holds the actions those pages share.
 *
 * Your read positions and read-receipts setting live in chat_state/<uid>, which
 * only you can read; readAt on a conversation is the shared copy others see.
 */
export function ChatProvider({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [uid, setUid] = useState(null);
  const [identities, setIdentities] = useState([]);
  const [identitiesLoaded, setIdentitiesLoaded] = useState(false);
  const [active, setActive] = useState(""); // usernameLower you post and start chats as
  const [convos, setConvos] = useState([]);
  const [convosLoaded, setConvosLoaded] = useState(false);
  const [blockedNames, setBlockedNames] = useState([]);
  const [openIds, setOpenIds] = useState({ private: null, groups: null }); // open chat per page
  // Profile popup: { username, coinsIn } — coinsIn is where coins can be sent from it
  // ({} = the Chatroom, { convoId } = a group, null = nowhere, e.g. private chats).
  const [profileOf, setProfileOf] = useState(null);
  const [coins, setCoins] = useState(0); // your chat coin balance
  const [coinSheet, setCoinSheet] = useState(null); // { kind: "wallet" } | { kind: "send", to, convoId }
  const [err, setErr] = useState("");
  const [chatState, setChatState] = useState({ reads: {}, readReceipts: true });
  const [typingIn, setTypingIn] = useState({}); // conversation id -> usernames typing there
  const [counts, setCounts] = useState({}); // "<id>:<last message ms>:<read since ms>" -> unread count
  const typingArrivals = useRef(new Map());
  const convosRef = useRef([]);
  const countsAsked = useRef(new Set());

  useEffect(() => onAuthStateChanged(auth, (u) => {
    if (!u) return router.push("/login");
    setUid(u.uid);
  }), [router]);

  // An error belongs to the page it happened on.
  useEffect(() => {
    const t = setTimeout(() => setErr(""), 0);
    return () => clearTimeout(t);
  }, [pathname]);

  // Keeps the active username if it's still yours, else falls back to your default one.
  const applyIdentities = useCallback((d) => {
    const items = d.items || [];
    setIdentities(items);
    setIdentitiesLoaded(true);
    setActive((cur) => (cur && items.some((i) => i.usernameLower === cur) ? cur : items.find((x) => x.isDefault)?.usernameLower || items[0]?.usernameLower || ""));
  }, []);

  useEffect(() => {
    if (!uid) return;
    authFetch("/api/chat/usernames").then(applyIdentities).catch(() => {});
  }, [uid, applyIdentities]);

  // Usernames the active identity has blocked: hidden in the public chatroom.
  useEffect(() => {
    if (!active) return;
    return onSnapshot(
      query(collection(db, "chat_blocks"), where("blocker", "==", active)),
      (s) => setBlockedNames(s.docs.map((d) => d.data().blocked)),
      () => setBlockedNames([])
    );
  }, [active]);

  // My conversations — one listener by account; Firestore rules only return
  // conversations whose participantUids include me.
  useEffect(() => {
    if (!uid || !identities.length) return;
    const lowers = identities.map((i) => i.usernameLower);
    return onSnapshot(
      query(collection(db, "conversations"), where("participantUids", "array-contains", uid), orderBy("lastMessageAt", "desc"), limit(50)),
      (s) => {
        const list = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => !c.deleted && (c.participants || []).some((p) => lowers.includes(p)));
        const now = Date.now();
        noteTypingArrivals(list, typingArrivals.current, now);
        convosRef.current = list;
        setConvos(list);
        setTypingIn((prev) => {
          const next = whoIsTyping(list, typingArrivals.current, lowers, now);
          return sameTyping(prev, next) ? prev : next;
        });
        setConvosLoaded(true);
      },
      (e) => setErr(`Could not load conversations: ${e.message}`)
    );
  }, [uid, identities]);

  // "typing…" expires on its own once a typer stops refreshing it.
  const anyoneTyping = Object.keys(typingIn).length > 0;
  useEffect(() => {
    if (!anyoneTyping) return;
    const lowers = identities.map((i) => i.usernameLower);
    const t = setInterval(() => setTypingIn((prev) => {
      const next = whoIsTyping(convosRef.current, typingArrivals.current, lowers, Date.now());
      return sameTyping(prev, next) ? prev : next;
    }), 1000);
    return () => clearInterval(t);
  }, [anyoneTyping, identities]);

  // Your coin balance (written only by /api/chat/coins).
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "coin_wallets", uid), (s) => setCoins(Math.max(0, Number(s.data()?.balance) || 0)), () => {});
  }, [uid]);

  // Your private read positions (for unread counts) and read-receipts setting.
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, "chat_state", uid),
      (s) => {
        const d = s.data() || {};
        setChatState({ reads: d.reads || {}, readReceipts: d.readReceipts !== false });
      },
      () => {}
    );
  }, [uid]);

  // Unread: chats whose last message is newer than where you've read up to. The
  // chat you're looking at doesn't count; it's being read.
  const viewingId = openIds[pathname.split("/")[2]] || null;
  const unreadCandidates = useMemo(() => convos.flatMap((c) => {
    const since = Math.max(chatState.reads[c.id]?.toMillis?.() ?? 0, READS_SINCE_MS);
    const lastMs = c.lastMessageAt?.toMillis?.() ?? 0;
    if (!c.lastMessage || lastMs <= since || c.id === viewingId) return [];
    return [{ id: c.id, since, key: `${c.id}:${lastMs}:${since}` }];
  }), [convos, chatState.reads, viewingId]);

  useEffect(() => {
    for (const { id, since, key } of unreadCandidates) {
      if (countsAsked.current.has(key)) continue;
      countsAsked.current.add(key);
      getCountFromServer(query(collection(db, "conversations", id, "messages"), where("createdAt", ">", Timestamp.fromMillis(since))))
        .then((r) => setCounts((p) => ({ ...p, [key]: r.data().count })))
        .catch(() => setCounts((p) => ({ ...p, [key]: 0 })));
    }
  }, [unreadCandidates]);

  const unread = useMemo(() => {
    const out = {};
    for (const { id, key } of unreadCandidates) if (counts[key] > 0) out[id] = counts[key];
    return out;
  }, [unreadCandidates, counts]);

  // Register this device session (listed under Settings → Chat profile).
  useEffect(() => {
    if (!uid || !active) return;
    const info = `${navigator.platform} · ${navigator.userAgent.slice(0, 60)}`;
    setDoc(doc(collection(db, "chat_sessions")), {
      uid, usernameLower: active, device: info, lastActive: serverTimestamp(),
    }).catch(() => {});
  }, [uid, active]);

  // The username you are in a conversation as: the active one if it's a member,
  // otherwise whichever of your usernames is.
  const myNameIn = useCallback((convo) => {
    const parts = convo?.participants || [];
    if (parts.includes(active)) return active;
    return parts.find((p) => identities.some((i) => i.usernameLower === p)) || active;
  }, [active, identities]);

  // Resolves to an error message for IdentityBar to show, or "" on success.
  const createUsername = useCallback(async (username) => {
    const r = await authFetch("/api/chat/usernames", { method: "POST", body: { username } });
    if (r.error) return r.error;
    applyIdentities(await authFetch("/api/chat/usernames"));
    return "";
  }, [applyIdentities]);

  const deleteUsername = useCallback(async (usernameLower) => {
    if (!confirm(`Permanently delete @${usernameLower}?`)) return;
    const r = await authFetch("/api/chat/usernames", { method: "DELETE", body: { username: usernameLower } });
    if (r.error) return setErr(r.error);
    setIdentities((p) => p.filter((i) => i.usernameLower !== usernameLower));
  }, []);

  const setOpenId = useCallback((section, id) => setOpenIds((p) => ({ ...p, [section]: id })), []);

  // Opens (creating if needed) your private chat with `target`, on the Private page.
  // Conversations are created server-side (it checks blocks and records participantUids).
  const messagePrivately = useCallback(async (target) => {
    setErr("");
    if (!active) return setErr("Claim a chat username first.");
    if (norm(target) === active) return;
    const r = await authFetch("/api/chat/conversations", { method: "POST", body: { action: "dm", as: active, target: norm(target) } });
    if (r.error) return setErr(r.error);
    setOpenId("private", r.id);
    if (pathname !== "/chat/private") router.push("/chat/private");
  }, [active, pathname, router, setOpenId]);

  const blockUser = useCallback(async (targetLower) => {
    const target = norm(targetLower);
    if (!active || !confirm(`Block @${target}? They won't be able to message you, and you won't see them in the chatroom.`)) return;
    await setDoc(doc(db, "chat_blocks", `${active}_${target}`), {
      blocker: active, blocked: target, createdAt: serverTimestamp(),
    });
    // Recorded on your private chat with them too: the rules refuse new messages from anyone listed in `blocked`.
    const c = convos.find((x) => x.type !== "group" && (x.participants || []).includes(target));
    if (c) await updateDoc(doc(db, "conversations", c.id), { blocked: arrayUnion(target) });
  }, [active, convos]);

  const reportUser = useCallback(async (targetLower, extra = {}) => {
    const reason = prompt(extra.messageId ? `Report @${norm(targetLower)}'s message? Tell us why:` : "Reason for report?");
    if (!reason) return;
    try {
      await addDoc(collection(db, "chat_reports"), {
        reporter: active, reported: norm(targetLower), reason, ...extra, createdAt: serverTimestamp(), status: "open",
      });
      alert("Report submitted.");
    } catch (e) {
      setErr(`Could not send the report: ${e.message}`);
    }
  }, [active]);

  const closeProfile = useCallback(() => setProfileOf(null), []);
  const openProfile = useCallback((username, coinsIn = null) => setProfileOf({ username: norm(username), coinsIn }), []);
  const openCoinWallet = useCallback(() => setCoinSheet({ kind: "wallet" }), []);
  // Send coins to `to` in the Chatroom (where = {}) or a group (where = { convoId }).
  const sendCoins = useCallback((to, where = {}) => setCoinSheet({ kind: "send", to: norm(to), convoId: where.convoId || null }), []);
  const closeCoins = useCallback(() => setCoinSheet(null), []);
  // Without a username there are no conversations to wait for.
  const convosLoading = !identitiesLoaded || (identities.length > 0 && !convosLoaded);

  const value = useMemo(() => ({
    uid, identities, active, setActive, createUsername, deleteUsername,
    convos, convosLoading, blockedNames, myNameIn, typingIn, unread, chatState,
    openIds, setOpenId,
    err, setErr,
    openProfile, messagePrivately, blockUser, reportUser,
    coins, openCoinWallet, sendCoins,
  }), [uid, identities, active, createUsername, deleteUsername, convos, convosLoading, blockedNames, myNameIn, typingIn, unread, chatState, openIds, setOpenId, err, openProfile, messagePrivately, blockUser, reportUser, coins, openCoinWallet, sendCoins]);

  return (
    <ChatContext.Provider value={value}>
      {children}
      {profileOf && (
        <ProfileSheet
          key={profileOf.username}
          username={profileOf.username}
          onClose={closeProfile}
          onMessage={messagePrivately}
          onSendCoins={profileOf.coinsIn ? (u) => sendCoins(u, profileOf.coinsIn) : undefined}
          onBlock={blockUser}
          onReport={reportUser}
        />
      )}
      {coinSheet?.kind === "wallet" && <CoinWalletSheet uid={uid} coins={coins} onClose={closeCoins} />}
      {coinSheet?.kind === "send" && (
        <SendCoinsSheet
          key={coinSheet.to}
          to={coinSheet.to}
          convoId={coinSheet.convoId}
          as={coinSheet.convoId ? myNameIn(convos.find((c) => c.id === coinSheet.convoId)) : active}
          coins={coins}
          onClose={closeCoins}
          onTopUp={openCoinWallet}
        />
      )}
    </ChatContext.Provider>
  );
}
