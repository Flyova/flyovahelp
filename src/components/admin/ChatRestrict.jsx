"use client";
import { useState } from "react";
import { addDoc, collection, deleteField, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Ban, Loader2, MessageSquareOff } from "lucide-react";
import { db } from "@/lib/firebase";
import { CHAT_SANCTION_LENGTHS, chatRestrictLeft, chatSanctionLabel, isChatRestricted } from "@/lib/chat";

// Restricting an account from Chats (usually after a report): users/{uid}.chatRestricted,
// until chatRestrictedUntil (ms; none = for good). The player can still read, but the
// server and the Firestore rules refuse anything they'd send in Chats (lib/chat
// isChatRestricted). They get a notification saying for how long.

/** "Restricted from Chats · 6 days, 23 hours left" (or "forever"), or "" when they aren't. */
export const chatRestrictionLabel = (user) =>
  isChatRestricted(user) ? `Restricted from Chats · ${chatRestrictLeft(user) ? `${chatRestrictLeft(user)} left` : "forever"}` : "";

/**
 * Sets (`days`: 1, 7 or 30, null for good) or lifts (`days` false) account `uid`'s
 * restriction from Chats; `name` is how the admin knows them. Returns false if the
 * admin cancelled.
 */
export async function setChatRestriction(uid, name, days) {
  const lift = days === false;
  const length = lift ? "" : chatSanctionLabel(days).toLowerCase();
  if (!window.confirm(lift
    ? `Let @${name} send messages in Chats again?`
    : `Restrict @${name} from Chats ${days ? `for ${length}` : "forever"}? They can still read, but can't send anything in the Chatroom, groups or private chats.`)) return false;
  await updateDoc(doc(db, "users", uid), lift
    ? { chatRestricted: false, chatRestrictedUntil: deleteField() }
    : { chatRestricted: true, chatRestrictedUntil: days ? Date.now() + days * 86400000 : deleteField() });
  await addDoc(collection(db, "users", uid, "notifications"), {
    type: "account",
    title: lift ? "You can chat again" : "Restricted from Chats",
    body: lift
      ? "An admin lifted your restriction. You can send messages in Chats again."
      : `After a report, an admin restricted you from sending messages in Chats ${days ? `for ${length}` : "permanently"}. You can still read your chats.`,
    url: "/chat", read: false, createdAt: serverTimestamp(),
  }).catch(() => {}); // the restriction stands even if the notice fails
  return true;
}

/**
 * The admin's control: "Restrict from Chats", then the lengths (24 hours, 1 week,
 * 30 days, Forever), or "Lift" while `user` (their users/ doc, if known) is
 * restricted. `onRestricted(days)` runs after a new restriction (e.g. to resolve the
 * report).
 */
export default function ChatRestrictButton({ uid, name, user, onRestricted, compact = false }) {
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const restricted = isChatRestricted(user);
  const run = async (days) => {
    setChoosing(false);
    setBusy(true);
    try {
      if ((await setChatRestriction(uid, name, days)) && days !== false) await onRestricted?.(days);
    } catch (err) {
      alert("Couldn't change it: " + err.message);
    } finally {
      setBusy(false);
    }
  };
  if (!uid) return null;
  const btn = "px-3 py-2 rounded-xl text-[10px] font-black uppercase inline-flex items-center gap-1";
  if (restricted) {
    return (
      <button type="button" onClick={() => run(false)} disabled={busy} className={`${btn} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>
        {busy ? <Loader2 size={12} className="animate-spin" /> : <MessageSquareOff size={12} />} Lift chat restriction
      </button>
    );
  }
  if (!choosing) {
    return (
      <button type="button" onClick={() => setChoosing(true)} disabled={busy} className={`${btn} bg-rose-50 text-rose-700 hover:bg-rose-100`}>
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />} {compact ? "Restrict" : "Restrict from Chats"}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-rose-50 p-1">
      <span className="px-2 text-[10px] font-black uppercase text-rose-700">Restrict for</span>
      {CHAT_SANCTION_LENGTHS.map((days) => (
        <button key={days ?? "forever"} type="button" onClick={() => run(days)}
          className="px-2.5 py-1.5 rounded-lg bg-white text-rose-700 text-[10px] font-black uppercase hover:bg-rose-100">
          {chatSanctionLabel(days)}
        </button>
      ))}
      <button type="button" onClick={() => setChoosing(false)} className="px-2 py-1.5 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600">Cancel</button>
    </span>
  );
}
