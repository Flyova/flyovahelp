"use client";
import { useState } from "react";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { Loader2, Lock } from "lucide-react";
import { auth } from "@/lib/firebase";
import { authFetch } from "@/lib/authFetch";
import Avatar from "@/components/Avatar";
import ChatSheet from "@/components/chat/ChatSheet";

const locksApi = (body) => authFetch("/api/chat/locks", { method: "POST", body });
const PIN_RE = /^\d{4,8}$/;

function PinInput({ value, onChange, label, autoFocus = false }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-black uppercase text-white/40 mb-1.5">{label}</span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 8))}
        className="w-full bg-black/40 border border-white/10 focus:border-[#8B1E3F] rounded-xl px-3 py-2.5 text-base tracking-[0.4em] outline-none"
      />
    </label>
  );
}

/**
 * Asks for a locked chat username's PIN before switching to it. "Forgot PIN?"
 * confirms your account password instead and removes the PIN.
 */
export default function PinSheet({ username, onUnlocked, onClose }) {
  const [pin, setPin] = useState("");
  const [forgot, setForgot] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const unlock = async (e) => {
    e.preventDefault();
    if (!PIN_RE.test(pin) || busy) return;
    setBusy(true);
    setError("");
    const r = await locksApi({ action: "unlock", username, pin }).catch((x) => ({ error: x.message }));
    setBusy(false);
    if (r.error) {
      setPin("");
      return setError(r.error);
    }
    onUnlocked();
  };

  // Forgot PIN: prove it's you with the account password, then the PIN is removed.
  const reset = async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user?.email || !password || busy) return;
    setBusy(true);
    setError("");
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
      await user.getIdToken(true);
      const r = await locksApi({ action: "remove", username });
      if (r.error) throw new Error(r.error);
      onUnlocked();
    } catch (x) {
      setError(/wrong-password|invalid-credential/.test(x.code || "") ? "That password isn't right." : x.message);
    }
    setBusy(false);
  };

  return (
    <ChatSheet label={`Unlock @${username}`} onClose={onClose}>
      <div className="p-5 pt-7">
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <Avatar username={username} size={64} rounded="rounded-full" />
            <span className="absolute -right-1 -bottom-1 w-7 h-7 rounded-full bg-[#8B1E3F] ring-4 ring-[#142036] flex items-center justify-center"><Lock size={13} /></span>
          </div>
          <h2 className="mt-3 text-lg font-black">@{username} is locked</h2>
          <p className="text-xs text-white/50 mt-0.5">{forgot ? "Enter your account password to remove this PIN." : "Enter its PIN to chat as this username."}</p>
        </div>

        {forgot ? (
          <form onSubmit={reset} className="mt-5 space-y-3">
            <label className="block">
              <span className="block text-[10px] font-black uppercase text-white/40 mb-1.5">Account password</span>
              <input
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/40 border border-white/10 focus:border-[#8B1E3F] rounded-xl px-3 py-2.5 text-base outline-none"
              />
            </label>
            {error && <p className="text-xs text-red-300">{error}</p>}
            <button type="submit" disabled={!password || busy} className="w-full h-11 rounded-xl bg-[#8B1E3F] text-xs font-black uppercase disabled:opacity-50 flex items-center justify-center gap-2">
              {busy && <Loader2 size={15} className="animate-spin" />} Remove PIN and unlock
            </button>
            <button type="button" onClick={() => { setForgot(false); setError(""); }} className="w-full text-[11px] font-bold text-white/50 hover:text-white">Back to PIN</button>
          </form>
        ) : (
          <form onSubmit={unlock} className="mt-5 space-y-3">
            <PinInput label="PIN" value={pin} onChange={setPin} autoFocus />
            {error && <p className="text-xs text-red-300">{error}</p>}
            <button type="submit" disabled={!PIN_RE.test(pin) || busy} className="w-full h-11 rounded-xl bg-[#8B1E3F] text-xs font-black uppercase disabled:opacity-50 flex items-center justify-center gap-2">
              {busy && <Loader2 size={15} className="animate-spin" />} Unlock
            </button>
            <button type="button" onClick={() => { setForgot(true); setError(""); }} className="w-full text-[11px] font-bold text-white/50 hover:text-white">Forgot PIN?</button>
          </form>
        )}
      </div>
    </ChatSheet>
  );
}

/**
 * Sets, changes or removes a chat username's PIN. `isLocked` = it has one now
 * (changing or removing it needs the current PIN). Calls `onDone` after a change.
 */
export function ManagePinSheet({ username, isLocked, onDone, onClose }) {
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (body) => {
    setBusy(true);
    setError("");
    const r = await locksApi(body).catch((x) => ({ error: x.message }));
    setBusy(false);
    if (r.error) return setError(r.error);
    onDone();
    onClose();
  };

  const save = (e) => {
    e.preventDefault();
    if (!PIN_RE.test(pin)) return setError("Use a PIN of 4 to 8 digits.");
    if (pin !== confirmPin) return setError("The two PINs don't match.");
    run({ action: "set", username, pin, ...(isLocked ? { currentPin: current } : {}) });
  };

  return (
    <ChatSheet label={`PIN for @${username}`} onClose={onClose}>
      <form onSubmit={save} className="p-5 pt-7 space-y-3">
        <div className="pr-10">
          <h2 className="text-lg font-black flex items-center gap-2"><Lock size={17} /> {isLocked ? "Change PIN" : "Lock with a PIN"}</h2>
          <p className="text-xs text-white/50 mt-0.5">
            @{username} and its chats stay hidden until the PIN is entered. Asked again in each new browser tab.
          </p>
        </div>
        {isLocked && <PinInput label="Current PIN" value={current} onChange={setCurrent} autoFocus />}
        <PinInput label="New PIN (4–8 digits)" value={pin} onChange={setPin} autoFocus={!isLocked} />
        <PinInput label="Repeat new PIN" value={confirmPin} onChange={setConfirmPin} />
        {error && <p className="text-xs text-red-300">{error}</p>}
        <button type="submit" disabled={busy} className="w-full h-11 rounded-xl bg-[#8B1E3F] text-xs font-black uppercase disabled:opacity-50 flex items-center justify-center gap-2">
          {busy && <Loader2 size={15} className="animate-spin" />} {isLocked ? "Change PIN" : "Set PIN"}
        </button>
        {isLocked && (
          <button
            type="button"
            disabled={busy || !PIN_RE.test(current)}
            onClick={() => run({ action: "remove", username, pin: current })}
            className="w-full h-10 rounded-xl bg-white/[0.05] hover:bg-white/10 text-xs font-black uppercase text-[#FF8A9B] disabled:opacity-40"
          >
            Remove PIN (enter current PIN above)
          </button>
        )}
      </form>
    </ChatSheet>
  );
}
