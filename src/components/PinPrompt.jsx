"use client";
import { useState } from "react";
import Link from "next/link";
import { KeyRound, Loader2, X } from "lucide-react";

/**
 * Asks for the 4-digit transaction PIN before a transfer or withdrawal.
 * `onSubmit(pin)` sends the request and returns its error body ({ error, status })
 * or nothing on success. A 428 means no PIN is set yet: it links to Settings.
 */
export default function PinPrompt({ open, title = "Enter your PIN", subtitle, onClose, onSubmit }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!open) return null;

  const close = () => {
    setPin("");
    setError(null);
    onClose?.();
  };

  const submit = async (e) => {
    e.preventDefault();
    if (pin.length !== 4 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const failed = await onSubmit(pin);
      if (failed?.error) {
        setError(failed);
        setPin("");
      } else {
        setPin("");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-[#0B1220]/90 backdrop-blur-sm">
      <form onSubmit={submit} className="bg-[#142036] w-full max-w-sm rounded-[2.5rem] border border-white/10 p-8 shadow-2xl space-y-6 relative text-white">
        <button type="button" onClick={close} className="absolute top-5 right-5 p-2 rounded-xl bg-white/5 text-white/50" aria-label="Close">
          <X size={16} />
        </button>
        <div className="w-14 h-14 bg-[#2457D6]/20 text-[#2457D6] rounded-3xl flex items-center justify-center mx-auto">
          <KeyRound size={26} />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-black uppercase italic tracking-tighter">{title}</h2>
          {subtitle && <p className="text-[11px] text-gray-400 font-bold mt-2 leading-relaxed">{subtitle}</p>}
        </div>
        {error?.status === 428 ? (
          <div className="space-y-4 text-center">
            <p className="text-[11px] font-bold text-amber-400 leading-relaxed">{error.error}</p>
            <Link href="/settings#security" className="block w-full bg-[#2457D6] py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest">
              Go to Settings
            </Link>
          </div>
        ) : (
          <>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="••••"
              aria-label="4-digit PIN"
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-center text-2xl font-black tracking-[0.8em] outline-none focus:border-[#2457D6]"
            />
            {error && <p className="text-[11px] font-bold text-red-400 text-center">{error.error}</p>}
            <button type="submit" disabled={pin.length !== 4 || busy} className="w-full bg-[#2457D6] py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 disabled:opacity-30">
              {busy ? <Loader2 size={14} className="animate-spin" /> : null} Confirm
            </button>
            <Link href="/settings#security" className="block text-center text-[10px] font-black uppercase tracking-widest text-white/40">
              Forgot your PIN?
            </Link>
          </>
        )}
      </form>
    </div>
  );
}
