"use client";
import { useState } from "react";
import { Loader2, LockKeyhole, LockKeyholeOpen } from "lucide-react";
import { authFetch } from "@/lib/authFetch";
import { CHAT_LOCK_REPORTS, CHAT_UNLOCK_PRICE, isChatLocked } from "@/lib/chat";

// Locking an account's Chats (lib/chat CHAT_UNLOCK_PRICE): none of its usernames can
// send anything, even from other accounts logged in to them, and other players can't
// find or message them, until the player pays $12 or an admin lifts it. Set and
// lifted through /api/chat/lock, which also marks the usernames and notifies them.

/** "Locked from Chats · 50 reports" / "· by an admin", or "" when they aren't. */
export const chatLockLabel = (user) =>
  isChatLocked(user) ? `Locked from Chats · ${user.chatLockReason === "reports" ? `${CHAT_LOCK_REPORTS} reports` : "by an admin"}` : "";

/** The admin's control: "Lock Chats", or "Unlock Chats" (free) while `user` is locked. */
export default function ChatLockButton({ uid, name, user, compact = false }) {
  const [busy, setBusy] = useState(false);
  const locked = isChatLocked(user);
  if (!uid) return null;
  const run = async () => {
    if (!window.confirm(locked
      ? `Unlock @${name}'s Chats for free?`
      : `Lock @${name} out of Chats? None of their usernames can send anything (even from other accounts logged in to them), and other players can't find or message them, until they pay $${CHAT_UNLOCK_PRICE} or you unlock it.`)) return;
    setBusy(true);
    try {
      const r = await authFetch("/api/chat/lock", { method: "POST", body: { action: locked ? "release" : "lock", uid } });
      if (r.error) alert("Couldn't change it: " + r.error);
    } finally {
      setBusy(false);
    }
  };
  const btn = "px-3 py-2 rounded-xl text-[10px] font-black uppercase inline-flex items-center gap-1";
  return locked ? (
    <button type="button" onClick={run} disabled={busy} className={`${btn} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>
      {busy ? <Loader2 size={12} className="animate-spin" /> : <LockKeyholeOpen size={12} />} {compact ? "Unlock" : "Unlock Chats"}
    </button>
  ) : (
    <button type="button" onClick={run} disabled={busy} className={`${btn} bg-slate-900 text-white hover:bg-slate-700`}>
      {busy ? <Loader2 size={12} className="animate-spin" /> : <LockKeyhole size={12} />} {compact ? "Lock" : "Lock Chats"}
    </button>
  );
}
