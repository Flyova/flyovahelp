"use client";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { chatRestrictMessage, chatRoomBlockMessage, isChatMuted } from "@/lib/chat";

/**
 * An admin's sanctions on your account (users/{uid}), live: `restricted` says why you
 * can't send anything in Chats, with the time left ("" when you can); `roomBlocked`
 * does the same for the Chatroom (a restriction or a mute) and `muted` is the mute on
 * its own. Rechecked every 30 seconds while one is on, so a timed one lifts by itself.
 */
export default function useChatSanctions(uid) {
  const [user, setUser] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "users", uid), (s) => {
      setUser(s.data() || null);
      setNow(Date.now());
    }, () => {});
  }, [uid]);
  const on = !!(user?.chatRestricted || user?.chatMuted);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [on]);
  return { restricted: chatRestrictMessage(user, now), roomBlocked: chatRoomBlockMessage(user, now), muted: isChatMuted(user, now) };
}
