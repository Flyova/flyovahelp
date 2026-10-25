"use client";
import { useEffect, useState } from "react";
import {
  FieldPath, collection, deleteField, doc, getDocs, limit, onSnapshot, query, setDoc, updateDoc, where,
} from "firebase/firestore";
import { Coins, Eye } from "lucide-react";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/authFetch";

// Takes your avatar off every chat where it shows how far you've read.
export async function clearMyReceipts(uid) {
  const mine = ((await authFetch("/api/chat/usernames")).items || []).map((i) => i.usernameLower);
  const snap = await getDocs(query(collection(db, "conversations"), where("participantUids", "array-contains", uid), limit(200)));
  await Promise.all(snap.docs.flatMap((d) => mine
    .filter((name) => d.data().readAt?.[name])
    .map((name) => updateDoc(d.ref, new FieldPath("readAt", name), deleteField(), "presenceBy", name).catch(() => null))));
}

/**
 * A chat privacy on/off switch stored in your private chat_state/<uid> (`field`,
 * `defaultOn` when never set). `onTurnOff(uid)` runs after switching it off.
 */
export function ChatPrivacySwitch({ uid, field, defaultOn, icon: Icon, title, text, onTurnOff }) {
  const [on, setOn] = useState(defaultOn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "chat_state", uid), (s) => {
      const value = s.data()?.[field];
      setOn(typeof value === "boolean" ? value : defaultOn);
    }, () => {});
  }, [uid, field, defaultOn]);

  const toggle = async () => {
    if (!uid || busy) return;
    const next = !on;
    setBusy(true);
    setError("");
    try {
      await setDoc(doc(db, "chat_state", uid), { [field]: next }, { merge: true });
      if (!next) await onTurnOff?.(uid);
    } catch (e) {
      setError(`Could not change this: ${e.message}`);
    }
    setBusy(false);
  };

  return (
    <div className="bg-black/20 p-4 rounded-2xl border border-white/5 mb-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={16} className="text-[#2457D6] shrink-0" />
          <p className="text-[11px] font-black uppercase">{title}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={title}
          disabled={busy || !uid}
          onClick={toggle}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-[#2457D6]" : "bg-white/15"}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : ""}`} />
        </button>
      </div>
      <p className="text-[10px] font-bold text-white/45 leading-relaxed mt-2">{text}</p>
      {error && <p className="text-[10px] font-bold text-red-400 mt-2">{error}</p>}
    </div>
  );
}

/**
 * Read receipts on/off (on by default). Like WhatsApp it works both ways: with
 * it off, others don't see when you've read their messages and you don't see
 * when they've read yours.
 */
export function ReadReceiptsSetting({ uid }) {
  return (
    <ChatPrivacySwitch
      uid={uid}
      field="readReceipts"
      defaultOn
      icon={Eye}
      title="Read receipts"
      text="Let people see your avatar under the messages you've read. If you turn this off, you won't see when they've read yours either."
      onTurnOff={clearMyReceipts}
    />
  );
}

/** "Show off your coins": your coin balance on your chat profile (off by default). */
export function ShowCoinsSetting({ uid }) {
  return (
    <ChatPrivacySwitch
      uid={uid}
      field="showCoins"
      defaultOn={false}
      icon={Coins}
      title="Show off your coins"
      text="Show your chat coin balance on your profile, so other players can see it when they tap you."
    />
  );
}
