"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc, arrayUnion, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { authFetch } from "@/lib/authFetch";
import { norm } from "@/lib/chat";
import ProfileSheet from "@/components/chat/ProfileSheet";

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

/**
 * State shared by the Chatroom, Private and Groups pages, kept while you move
 * between them: who you are (your chat usernames and the one you're using), your
 * conversations, the usernames you've blocked, the chat open on each page, and
 * the profile popup. Also holds the actions those pages share.
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
  const [profileOf, setProfileOf] = useState(null); // username whose profile popup is open
  const [err, setErr] = useState("");

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
        setConvos(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => !c.deleted && (c.participants || []).some((p) => lowers.includes(p))));
        setConvosLoaded(true);
      },
      (e) => setErr(`Could not load conversations: ${e.message}`)
    );
  }, [uid, identities]);

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
  // Without a username there are no conversations to wait for.
  const convosLoading = !identitiesLoaded || (identities.length > 0 && !convosLoaded);

  const value = useMemo(() => ({
    uid, identities, active, setActive, createUsername, deleteUsername,
    convos, convosLoading, blockedNames, myNameIn,
    openIds, setOpenId,
    err, setErr,
    openProfile: setProfileOf, messagePrivately, blockUser, reportUser,
  }), [uid, identities, active, createUsername, deleteUsername, convos, convosLoading, blockedNames, myNameIn, openIds, setOpenId, err, messagePrivately, blockUser, reportUser]);

  return (
    <ChatContext.Provider value={value}>
      {children}
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
    </ChatContext.Provider>
  );
}
