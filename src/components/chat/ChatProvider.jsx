"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  Timestamp, addDoc, arrayUnion, collection, deleteDoc, doc, documentId, getCountFromServer, limit, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { authFetch } from "@/lib/authFetch";
import { playChatSound } from "@/lib/chatSound";
import { PRESENCE_PING_MS, READS_SINCE_MS, TYPING_SHOW_MS, norm } from "@/lib/chat";
import { CoinWalletSheet, SendCoinsSheet } from "@/components/chat/CoinSheets";
import ChatDialog from "@/components/chat/ChatDialog";

const ChatContext = createContext(null);

// The Chats pages, at /chat/<key>. /chat itself is Chats home, where you pick one.
export const CHAT_SECTIONS = [
  { key: "room", label: "Chatroom" },
  { key: "private", label: "Private" },
  { key: "groups", label: "Groups" },
];

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

const QUIET_START_MS = 4000; // no sounds for the unread counts that load with the page

// Your chat_state/<uid> with defaults filled in. The privacy and sound fields here
// are the account-wide settings from before settings were per chat profile; a
// profile that hasn't set its own falls back to them.
const readChatState = (d = {}, loaded = false) => ({
  loaded,
  reads: d.reads || {},
  readReceipts: d.readReceipts !== false,
  showOnline: d.showOnline !== false,
  hideCountry: d.hideCountry === true,
  showCoins: d.showCoins === true,
  sounds: d.sounds || {}, // { room, private, groups: { <id>: bool }, people: { <name>: bool } } — all on unless false
  archived: d.archived || {}, // conversation id -> true while archived
  cleared: d.cleared || {}, // conversation id -> when you deleted the chat (messages before it are gone for you)
});

// One chat profile's settings, from /api/chat/settings (or the account fallback above).
const fallbackSettings = (state) => ({
  allowGroupAdds: true,
  readReceipts: state.readReceipts,
  showOnline: state.showOnline,
  hideCountry: state.hideCountry,
  showCoins: state.showCoins,
  sounds: {
    room: state.sounds.room !== false,
    private: state.sounds.private !== false,
    groups: state.sounds.groups || {},
    people: state.sounds.people || {},
  },
});

// Applies a settings change locally (sound maps merge key by key).
const mergeSettings = (cur, patch) => ({
  ...cur,
  ...patch,
  sounds: {
    ...cur.sounds,
    ...(patch.sounds || {}),
    groups: { ...cur.sounds.groups, ...(patch.sounds?.groups || {}) },
    people: { ...cur.sounds.people, ...(patch.sounds?.people || {}) },
  },
});

/**
 * State shared by the Chatroom, Private and Groups pages, kept while you move
 * between them: who you are (your chat usernames and the one you're using), your
 * conversations, who is typing in them and how many messages you haven't read,
 * the usernames you've blocked, and the chat open on each page. Also holds the
 * actions those pages share.
 *
 * Your read positions and settings (read receipts, sounds, online status, hidden
 * country, coins on show) live in chat_state/<uid>, which only you can read;
 * readAt on a conversation is the shared copy others see. Your usernames include
 * other accounts' usernames you've logged in to with their password.
 *
 * Each username stands on its own, like a separate account: the chats and groups
 * listed are the ones the username you're using is in, it has its own coin
 * wallet and its own settings, and switching username closes the chats open as
 * the previous one.
 */
export function ChatProvider({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [uid, setUid] = useState(null);
  const [identities, setIdentities] = useState([]);
  const [identitiesLoaded, setIdentitiesLoaded] = useState(false);
  const [usernamePrice, setUsernamePrice] = useState(null); // what one more username costs ($, 0 = free)
  const [active, setActive] = useState(""); // usernameLower you post and start chats as
  const [allConvos, setAllConvos] = useState([]); // every conversation the account can read
  const [convosLoaded, setConvosLoaded] = useState(false);
  const [presence, setPresence] = useState({}); // username -> chat_presence doc (your private-chat partners)
  const [presenceNow, setPresenceNow] = useState(0); // ticks so "online" turns into "last seen" on its own
  const [blockedNames, setBlockedNames] = useState([]);
  const [openIds, setOpenIds] = useState({ private: null, groups: null }); // open chat per page
  const [balances, setBalances] = useState({}); // usernameLower -> that username's coin balance
  const [coinSheet, setCoinSheet] = useState(null); // { kind: "wallet", name } | { kind: "send", to, convoId }
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState(""); // short confirmation, e.g. "You blocked @ade."
  const [dialog, setDialog] = useState(null); // { title, message, actions, resolve }
  const [chatState, setChatState] = useState(() => readChatState());
  const [profileSettings, setProfileSettings] = useState({}); // usernameLower -> that chat profile's settings
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsChoice, setSettingsChoice] = useState(""); // the chat profile Chat settings is showing
  const [typingIn, setTypingIn] = useState({}); // conversation id -> usernames typing there
  const [counts, setCounts] = useState({}); // "<id>:<last message ms>:<read since ms>" -> unread count
  const typingArrivals = useRef(new Map());
  const convosRef = useRef([]);
  const countsAsked = useRef(new Set());
  const prevUnread = useRef({});
  const startedAt = useRef(0);

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
    if (typeof d.nextPrice === "number") setUsernamePrice(d.nextPrice);
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
  // conversations whose participantUids include me. It starts as soon as you're
  // signed in (not after your usernames load), so chats show sooner; which of them
  // are yours is worked out below once the usernames are in.
  const lowersRef = useRef([]);
  useEffect(() => {
    lowersRef.current = identities.map((i) => i.usernameLower);
  }, [identities]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, "conversations"), where("participantUids", "array-contains", uid), orderBy("lastMessageAt", "desc"), limit(50)),
      (s) => {
        const list = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => !c.deleted);
        const now = Date.now();
        noteTypingArrivals(list, typingArrivals.current, now);
        convosRef.current = list;
        setAllConvos(list);
        setTypingIn((prev) => {
          const next = whoIsTyping(list, typingArrivals.current, lowersRef.current, now);
          return sameTyping(prev, next) ? prev : next;
        });
        setConvosLoaded(true);
      },
      (e) => setErr(`Could not load conversations: ${e.message}`)
    );
  }, [uid]);

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

  // Each username's coin balance, username_wallets/<username> (written only by /api/chat/coins).
  const walletKey = identities.map((i) => i.usernameLower).sort().join(",");
  useEffect(() => {
    if (!walletKey) return;
    const offs = walletKey.split(",").map((name) => onSnapshot(
      doc(db, "username_wallets", name),
      (s) => setBalances((p) => ({ ...p, [name]: Math.max(0, Number(s.data()?.balance) || 0) })),
      () => {}
    ));
    return () => offs.forEach((off) => off());
  }, [walletKey]);
  const coinsOf = useCallback((name) => balances[name] || 0, [balances]);
  const coins = coinsOf(active);

  // Your private read positions (for unread counts) and chat settings.
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "chat_state", uid), (s) => setChatState(readChatState(s.data(), true)), () => {});
  }, [uid]);

  const updateChatState = useCallback((patch) => setDoc(doc(db, "chat_state", uid), patch, { merge: true }), [uid]);

  // Each chat profile's own settings (read receipts, online status, hidden country,
  // coins on show, sounds), kept by the server in chat_settings/<username>.
  // Profiles changed here since the last load keep their newer local values.
  const changedSettings = useRef(new Set());
  useEffect(() => {
    if (!uid || !identities.length) return;
    changedSettings.current = new Set();
    authFetch("/api/chat/settings").then((r) => {
      if (!r.error) {
        setProfileSettings((p) => {
          const next = { ...(r.items || {}) };
          for (const name of changedSettings.current) if (p[name]) next[name] = p[name];
          return next;
        });
      }
      setSettingsLoaded(true);
    }).catch(() => setSettingsLoaded(true));
  }, [uid, identities]);

  const settingsFor = useCallback(
    (name) => profileSettings[name] || fallbackSettings(chatState),
    [profileSettings, chatState]
  );

  // Changes one chat profile's settings: shown at once, saved by the server.
  const updateSettings = useCallback(async (name, patch) => {
    changedSettings.current.add(name);
    const before = profileSettings[name];
    setProfileSettings((p) => ({ ...p, [name]: mergeSettings(p[name] || fallbackSettings(chatState), patch) }));
    const r = await authFetch("/api/chat/settings", { method: "POST", body: { username: name, settings: patch } })
      .catch((e) => ({ error: e.message }));
    if (r.error) {
      setProfileSettings((p) => ({ ...p, [name]: before }));
      throw new Error(r.error);
    }
    setProfileSettings((p) => ({ ...p, [name]: r.settings }));
  }, [profileSettings, chatState]);

  const myLowers = useMemo(() => identities.map((i) => i.usernameLower), [identities]);
  // Conversations one of your usernames is in (an account you logged out of a
  // username may still be listed in some for a moment).
  const myConvos = useMemo(
    () => allConvos.filter((c) => (c.participants || []).some((p) => myLowers.includes(p))),
    [allConvos, myLowers]
  );
  // The ones the username you're using is in: what the Chats pages list.
  const convos = useMemo(() => myConvos.filter((c) => (c.participants || []).includes(active)), [myConvos, active]);

  // Unread: chats whose last message is newer than where you've read up to. The
  // chat you're looking at doesn't count; it's being read. Counted for every one
  // of your usernames, so the others can show theirs on the username switcher.
  const viewingId = openIds[pathname.split("/")[2]] || null;
  const unreadCandidates = useMemo(() => myConvos.flatMap((c) => {
    const since = Math.max(chatState.reads[c.id]?.toMillis?.() ?? 0, chatState.cleared[c.id]?.toMillis?.() ?? 0, READS_SINCE_MS);
    const lastMs = c.lastMessageAt?.toMillis?.() ?? 0;
    if (!c.lastMessage || lastMs <= since || c.id === viewingId) return [];
    return [{ id: c.id, since, key: `${c.id}:${lastMs}:${since}` }];
  }), [myConvos, chatState.reads, chatState.cleared, viewingId]);

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

  // How many chats each of your usernames has unread (archived ones don't count).
  const unreadByName = useMemo(() => {
    const out = {};
    for (const c of myConvos) {
      if (!unread[c.id] || chatState.archived[c.id]) continue;
      for (const p of c.participants || []) if (myLowers.includes(p)) out[p] = (out[p] || 0) + 1;
    }
    return out;
  }, [myConvos, unread, chatState.archived, myLowers]);

  // New-message sounds, switched on or off per chat in Chat settings → Notifications.
  // kind: "room", "private" or "group" (with its id).
  // A private chat is also silent if you muted that person (sounds.people.<name>);
  // archived chats are always silent.
  // Each chat profile has its own sound settings: the Chatroom uses the username
  // you're posting as, a chat the username you're in it as (any of yours, not
  // just the one you're using).
  const soundOn = useCallback((kind, convoId) => {
    if (kind === "room") return settingsFor(active).sounds.room !== false;
    if (chatState.archived[convoId]) return false;
    const convo = myConvos.find((c) => c.id === convoId);
    const parts = convo?.participants || [];
    const s = settingsFor(parts.includes(active) ? active : parts.find((p) => myLowers.includes(p)) || active).sounds;
    if (kind === "private") {
      if (s.private === false) return false;
      const other = parts.find((p) => !myLowers.includes(p));
      return !other || s.people?.[other] !== false;
    }
    return s.groups?.[convoId] !== false;
  }, [settingsFor, active, chatState.archived, myConvos, myLowers]);


  useEffect(() => {
    startedAt.current = Date.now();
  }, []);
  // A chat you're not looking at got another unread message: play the sound.
  useEffect(() => {
    const prev = prevUnread.current;
    prevUnread.current = unread;
    if (Date.now() - startedAt.current < QUIET_START_MS) return;
    const ring = Object.entries(unread).some(([id, n]) => {
      const c = myConvos.find((x) => x.id === id);
      return c && n > (prev[id] || 0) && soundOn(c.type === "group" ? "group" : "private", id);
    });
    if (ring) playChatSound();
  }, [unread, myConvos, soundOn]);

  // Online status: while Chats is open and on screen, the username you're using
  // says it's here every minute (hidden if you've switched online status off).
  const showOnline = settingsFor(active).showOnline;
  useEffect(() => {
    if (!active || !chatState.loaded) return;
    const ref = doc(db, "chat_presence", active);
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      setDoc(ref, { lastActive: serverTimestamp(), hidden: !showOnline }).catch(() => {});
    };
    ping();
    const t = setInterval(ping, PRESENCE_PING_MS);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [active, chatState.loaded, showOnline]);

  // Your private-chat partners' online status, 30 names per listener.
  const partnerKey = useMemo(() => [...new Set(convos
    .filter((c) => c.type !== "group")
    .flatMap((c) => (c.participants || []).filter((p) => !myLowers.includes(p))))].sort().join(","), [convos, myLowers]);
  useEffect(() => {
    if (!partnerKey) return;
    const names = partnerKey.split(",");
    const offs = [];
    for (let i = 0; i < names.length; i += 30) {
      offs.push(onSnapshot(
        query(collection(db, "chat_presence"), where(documentId(), "in", names.slice(i, i + 30))),
        (s) => setPresence((p) => {
          const next = { ...p };
          s.docs.forEach((d) => { next[d.id] = d.data(); });
          return next;
        }),
        () => {}
      ));
    }
    return () => offs.forEach((off) => off());
  }, [partnerKey]);
  useEffect(() => {
    const tick = () => setPresenceNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 30000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

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
    return parts.find((p) => myLowers.includes(p)) || active;
  }, [active, myLowers]);

  // Reloads your usernames, e.g. after logging in to or out of one.
  const refreshIdentities = useCallback(() => authFetch("/api/chat/usernames").then(applyIdentities).catch(() => {}), [applyIdentities]);

  // Resolves to an error message for IdentityBar to show, or "" on success.
  const createUsername = useCallback(async (username) => {
    const r = await authFetch("/api/chat/usernames", { method: "POST", body: { username } });
    if (r.error) return r.error;
    applyIdentities(await authFetch("/api/chat/usernames"));
    return "";
  }, [applyIdentities]);

  // In-app dialogs instead of the browser's confirm(): ask() resolves to the chosen
  // action's value, or null for Cancel; confirmAction() to true or false.
  const ask = useCallback((options) => new Promise((resolve) => setDialog({ ...options, resolve })), []);
  const confirmAction = useCallback(
    async ({ title, message, confirmLabel, danger = true }) =>
      (await ask({ title, message, actions: [{ label: confirmLabel, value: true, tone: danger ? "danger" : "primary" }] })) === true,
    [ask]
  );
  const closeDialog = useCallback((value) => {
    setDialog((d) => {
      d?.resolve(value);
      return null;
    });
  }, []);

  const setOpenId = useCallback((section, id) => setOpenIds((p) => ({ ...p, [section]: id })), []);

  // Switches to another of your usernames: its own chats, groups, coins and
  // settings. Chats open as the previous one close.
  const selectIdentity = useCallback((name) => {
    setActive(name);
    setOpenIds({ private: null, groups: null });
    setSettingsChoice("");
  }, []);

  // Your username isn't known for a moment after a page opens: say so instead of doing nothing.
  const needUsername = useCallback(() => {
    setErr(identitiesLoaded ? "Claim a chat username first." : "Still loading your chat username. Try again in a moment.");
  }, [identitiesLoaded]);

  // Opens (creating if needed) your private chat with `target`, on the Private page.
  // Conversations are created server-side (it checks blocks and records participantUids).
  const messagePrivately = useCallback(async (target) => {
    setErr("");
    if (!active) return needUsername();
    if (norm(target) === active) return;
    const r = await authFetch("/api/chat/conversations", { method: "POST", body: { action: "dm", as: active, target: norm(target) } });
    if (r.error) return setErr(r.error);
    setOpenId("private", r.id);
    if (pathname !== "/chat/private") router.push("/chat/private");
  }, [active, pathname, router, setOpenId, needUsername]);

  const flashNotice = useCallback((msg) => {
    setNotice(msg);
    setTimeout(() => setNotice((cur) => (cur === msg ? "" : cur)), 3000);
  }, []);

  // Archive / delete a chat for you only (the other members keep theirs). A deleted
  // chat comes back, with only new messages, when someone writes in it again.
  const archiveChat = useCallback((id, on) => updateChatState({ archived: { [id]: on } })
    .then(() => flashNotice(on ? "Chat archived." : "Chat moved back to your chats."))
    .catch((e) => setErr(`Could not save: ${e.message}`)), [updateChatState, flashNotice]);
  const deleteChat = useCallback((id) => updateChatState({ cleared: { [id]: serverTimestamp() }, archived: { [id]: false } })
    .then(() => {
      setOpenIds((p) => ({ private: p.private === id ? null : p.private, groups: p.groups === id ? null : p.groups }));
      flashNotice("Chat deleted for you.");
    })
    .catch((e) => setErr(`Could not delete the chat: ${e.message}`)), [updateChatState, flashNotice]);

  // Delete a private chat: for both people (its messages are erased) or just for you.
  const removeChat = useCallback(async (convo) => {
    const me = (convo.participants || []).find((p) => myLowers.includes(p)) || active;
    const other = (convo.participants || []).find((p) => p !== me) || "them";
    const choice = await ask({
      title: `Delete your chat with @${other}?`,
      message: `"Delete for everyone" erases every message for both of you. "Delete just for me" clears it on your side only.`,
      actions: [
        { label: "Delete for everyone", value: "everyone", tone: "danger" },
        { label: "Delete just for me", value: "me", tone: "secondary" },
      ],
    });
    if (choice === "me") return deleteChat(convo.id);
    if (choice !== "everyone") return;
    const r = await authFetch("/api/chat/conversations", { method: "POST", body: { action: "deleteChat", convoId: convo.id, as: me } });
    if (r.error) return setErr(r.error);
    setOpenIds((p) => ({ private: p.private === convo.id ? null : p.private, groups: p.groups === convo.id ? null : p.groups }));
    flashNotice(`Chat with @${other} deleted for both of you.`);
  }, [ask, active, myLowers, deleteChat, flashNotice]);
  // Hidden from your lists: deleted with nothing new since, or archived.
  const isDeletedForMe = useCallback((c) => {
    const at = chatState.cleared[c.id]?.toMillis?.();
    return !!at && (c.lastMessageAt?.toMillis?.() ?? 0) <= at;
  }, [chatState.cleared]);

  const blockUser = useCallback(async (targetLower) => {
    const target = norm(targetLower);
    if (!active) return needUsername();
    if (!(await confirmAction({
      title: `Block @${target}?`,
      message: "They won't be able to message you or send you coins, and you won't see them in the Chatroom.",
      confirmLabel: "Block",
    }))) return;
    try {
      await setDoc(doc(db, "chat_blocks", `${active}_${target}`), {
        blocker: active, blocked: target, createdAt: serverTimestamp(),
      });
      // Recorded on your private chat with them too: the rules refuse new messages from anyone listed in `blocked`.
      const c = convos.find((x) => x.type !== "group" && (x.participants || []).includes(target) && (x.participants || []).includes(active));
      if (c) await updateDoc(doc(db, "conversations", c.id), { blocked: arrayUnion(target) });
      flashNotice(`You blocked @${target}.`);
    } catch (e) {
      setErr(`Could not block @${target}: ${e.message}`);
    }
  }, [active, convos, flashNotice, needUsername, confirmAction]);

  // `as`: which of your usernames lifts the block (the one you're using by default).
  const unblockUser = useCallback(async (targetLower, as = active) => {
    const target = norm(targetLower);
    if (!as) return needUsername();
    try {
      await deleteDoc(doc(db, "chat_blocks", `${as}_${target}`));
      const r = await authFetch("/api/chat/conversations", { method: "POST", body: { action: "unblock", as, target } });
      if (r.error) throw new Error(r.error);
      flashNotice(`@${target} is unblocked.`);
    } catch (e) {
      setErr(`Could not unblock: ${e.message}`);
    }
  }, [active, flashNotice, needUsername]);

  const reportUser = useCallback(async (targetLower, extra = {}) => {
    const reason = await ask({
      title: extra.messageId ? `Report @${norm(targetLower)}'s message?` : `Report @${norm(targetLower)}?`,
      message: "Tell us what's wrong. Our team reviews every report.",
      actions: ["Spam or scam", "Abuse or harassment", "Inappropriate messages", "Something else"].map((r) => ({ label: r, value: r, tone: "secondary" })),
    });
    if (!reason) return;
    try {
      await addDoc(collection(db, "chat_reports"), {
        reporter: active, reported: norm(targetLower), reason, ...extra, createdAt: serverTimestamp(), status: "open",
      });
      flashNotice("Report sent. Thanks, our team will review it.");
    } catch (e) {
      setErr(`Could not send the report: ${e.message}`);
    }
  }, [active, ask, flashNotice]);

  // A player's full profile page.
  const openProfile = useCallback((username) => router.push(`/chat/u/${encodeURIComponent(norm(username))}`), [router]);
  // A username's coin wallet (the one you're using unless `name` is given; also works as an onClick).
  const openCoinWallet = useCallback((name) => setCoinSheet({ kind: "wallet", name: typeof name === "string" ? name : "" }), []);
  // Send coins to `to` in the Chatroom (where = {}) or a group (where = { convoId }).
  const sendCoins = useCallback((to, where = {}) => setCoinSheet({ kind: "send", to: norm(to), convoId: where.convoId || null }), []);
  const closeCoins = useCallback(() => setCoinSheet(null), []);
  // The chat profile Chat settings is showing: the one picked there, else the one you're using.
  const settingsName = settingsChoice && myLowers.includes(settingsChoice) ? settingsChoice : active;

  // Without a username there are no conversations to wait for.
  const convosLoading = !identitiesLoaded || (identities.length > 0 && !convosLoaded);

  const value = useMemo(() => ({
    uid, identities, identitiesLoaded, active, selectIdentity, refreshIdentities, createUsername, usernamePrice,
    convos, myConvos, convosLoading, blockedNames, myNameIn, typingIn, unread, unreadByName, chatState,
    openIds, setOpenId,
    err, setErr, notice, flashNotice,
    openProfile, messagePrivately, blockUser, unblockUser, reportUser,
    coins, coinsOf, openCoinWallet, sendCoins,
    updateChatState, soundOn, presence, presenceNow,
    settingsFor, updateSettings, settingsLoaded, settingsName, setSettingsName: setSettingsChoice,
    archiveChat, deleteChat, removeChat, isDeletedForMe, ask, confirmAction, needUsername,
  }), [uid, identities, identitiesLoaded, active, selectIdentity, myConvos, unreadByName, coinsOf, refreshIdentities, createUsername, usernamePrice, archiveChat, deleteChat, isDeletedForMe, convos, convosLoading, blockedNames, myNameIn, typingIn, unread, chatState, openIds, setOpenId, err, notice, flashNotice, openProfile, messagePrivately, blockUser, unblockUser, reportUser, coins, openCoinWallet, sendCoins, updateChatState, soundOn, presence, presenceNow, settingsFor, updateSettings, settingsLoaded, settingsName, removeChat, ask, confirmAction, needUsername]);

  // Whose coins the open coin sheet uses: the wallet's username, or who you send as.
  const walletName = coinSheet?.name || active;
  const sendAs = coinSheet?.convoId ? myNameIn(convos.find((c) => c.id === coinSheet.convoId)) : active;

  return (
    <ChatContext.Provider value={value}>
      {children}
      {dialog && <ChatDialog title={dialog.title} message={dialog.message} actions={dialog.actions} onDone={closeDialog} />}
      {coinSheet?.kind === "wallet" && (
        <CoinWalletSheet
          key={walletName}
          uid={uid}
          name={walletName}
          coins={coinsOf(walletName)}
          canWithdraw={!identities.find((i) => i.usernameLower === walletName)?.linked}
          onClose={closeCoins}
        />
      )}
      {coinSheet?.kind === "send" && (
        <SendCoinsSheet
          key={coinSheet.to}
          to={coinSheet.to}
          convoId={coinSheet.convoId}
          as={sendAs}
          coins={coinsOf(sendAs)}
          onClose={closeCoins}
          onTopUp={() => openCoinWallet(sendAs)}
        />
      )}
    </ChatContext.Provider>
  );
}
