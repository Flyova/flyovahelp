"use client";
import { useEffect } from "react";
import { Coins } from "lucide-react";
import { formatCoins } from "@/lib/chat";

const PIECES = 24;
const DURATION_MS = 2300;

// Fixed pseudo-random numbers per piece, so the burst renders the same every time.
const rand = (i, k) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const PIECE_STYLE = Array.from({ length: PIECES }, (_, i) => ({
  left: 4 + rand(i, 1) * 92,
  size: 16 + rand(i, 2) * 18,
  delay: rand(i, 3) * 0.55,
  duration: 1.3 + rand(i, 4) * 0.8,
  drift: (rand(i, 5) - 0.5) * 90,
  spin: (rand(i, 6) - 0.5) * 540,
  bubble: i % 3 === 0,
}));

/**
 * Coins and bubbles rising over the chat when someone sends coins, with a
 * "+50 coins" pop in the middle ("You got 50 coins!" for the receiver).
 * Calls `onDone` when it's over; key it by the coin message id.
 */
export default function CoinBurst({ coins, to, forYou = false, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, DURATION_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-live="polite">
      {PIECE_STYLE.map((p, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`coin-piece absolute -bottom-10 rounded-full flex items-center justify-center ${p.bubble ? "bg-[#F6C453]/25 border border-[#F6C453]/60" : "bg-gradient-to-br from-[#FBD772] to-[#D18E1F] text-[#2B1800] shadow-[0_2px_10px_rgba(246,196,83,0.5)]"}`}
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            "--drift": `${p.drift}px`,
            "--spin": `${p.spin}deg`,
          }}
        >
          {!p.bubble && <Coins size={Math.round(p.size * 0.6)} />}
        </span>
      ))}
      <div className="coin-pop absolute left-1/2 top-1/2 px-5 py-3 rounded-2xl bg-gradient-to-br from-[#FBD772] to-[#D18E1F] text-[#2B1800] text-center shadow-[0_12px_40px_rgba(246,196,83,0.45)]">
        <p className="flex items-center justify-center gap-1.5 text-xl font-black leading-tight">
          <Coins size={20} /> {forYou ? `You got ${formatCoins(coins)}!` : `+${formatCoins(coins)}`}
        </p>
        <p className="text-[12px] font-bold opacity-80">{forYou ? `coin${coins === 1 ? "" : "s"}` : `coin${coins === 1 ? "" : "s"} to @${to}`}</p>
      </div>
    </div>
  );
}
