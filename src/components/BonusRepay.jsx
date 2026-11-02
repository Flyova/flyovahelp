"use client";
import { useState } from "react";
import Link from "next/link";
import { Gift, Loader2 } from "lucide-react";
import { authFetch } from "@/lib/authFetch";

// The $3 welcome bonus (lib/money owesBonus, which the server checks): play with
// friends and buying chat coins wait until it's paid back.
export const WELCOME_BONUS = 3;
export const owesWelcomeBonus = (account) => !!account?.bonusClaimed && !account?.bonusDeducted;

/**
 * Shown in place of what the bonus holds back (`what`: "play with friends").
 * Pays it back from the main wallet (`balance`, in dollars); the account's
 * bonusDeducted flips and whatever listens to it lets the player through.
 */
export default function BonusRepay({ what, balance, className = "" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const short = balance !== null && Number(balance || 0) < WELCOME_BONUS;

  const repay = async () => {
    setBusy(true);
    setError("");
    const r = await authFetch("/api/wallet", { method: "POST", body: { action: "bonusRepay" } }).catch((e) => ({ error: e.message }));
    setBusy(false);
    if (r.error) setError(r.error);
  };

  return (
    <div className={`rounded-2xl bg-black/25 border border-[#F6C453]/25 p-5 text-center ${className}`}>
      <span className="mx-auto mb-3 w-12 h-12 rounded-2xl bg-[#F6C453]/15 text-[#F6C453] flex items-center justify-center"><Gift size={22} /></span>
      <h2 className="text-base font-black">Pay back your welcome bonus</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-white/60">
        You claimed the ${WELCOME_BONUS} welcome bonus when you signed up. Pay it back from your wallet to {what}.
      </p>
      <p className="mt-2 text-xs text-white/45">Wallet: {balance === null ? "…" : `$${Number(balance || 0).toFixed(2)}`}</p>
      {short ? (
        <Link href="/deposit" className="mt-4 w-full h-12 rounded-xl bg-[#2457D6] hover:bg-[#2B63EA] text-sm font-black uppercase flex items-center justify-center">
          Deposit to pay it back
        </Link>
      ) : (
        <button
          type="button"
          onClick={repay}
          disabled={busy || balance === null}
          className="mt-4 w-full h-12 rounded-xl bg-gradient-to-br from-[#F6C453] to-[#D18E1F] text-[#2B1800] text-sm font-black uppercase disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy && <Loader2 size={16} className="animate-spin" />} Pay back ${WELCOME_BONUS.toFixed(2)}
        </button>
      )}
      {error && <p className="mt-3 text-xs font-bold p-2.5 rounded-xl bg-red-500/10 text-red-300">{error}</p>}
    </div>
  );
}
