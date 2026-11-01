"use client";
import { Star } from "lucide-react";

// An agent's online dot and star rating, as /api/trades gives them (online,
// lastSeenAt, rating: { average, count }), and the stars a player rates them with.

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function lastSeenText(ms, now = Date.now()) {
  const min = Math.max(0, Math.floor((now - ms) / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** A green "Online", or "Last seen …" / "Offline". */
export function AgentPresence({ online, lastSeenAt, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-tighter ${online ? "text-green-400" : "text-white/40"} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]" : "bg-white/25"}`} />
      {online ? "Online" : lastSeenAt ? `Last seen ${lastSeenText(lastSeenAt)}` : "Offline"}
    </span>
  );
}

/** The dot on an agent's avatar square: green when they're online. */
export function OnlineDot({ online }) {
  return (
    <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#142036] ${online ? "bg-green-400" : "bg-slate-500"}`}
      aria-label={online ? "Online" : "Offline"} />
  );
}

/** "★ 4.5 (12 ratings)", or "No ratings yet". */
export function AgentRating({ rating, className = "" }) {
  const count = rating?.count || 0;
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-tighter ${count ? "text-amber-400" : "text-white/30"} ${className}`}>
      <Star size={10} className={count ? "fill-amber-400" : ""} />
      {count ? `${rating.average.toFixed(1)} (${count} rating${count === 1 ? "" : "s"})` : "No ratings yet"}
    </span>
  );
}

/** Five stars to tap; `value` is the player's current rating (0: none). */
export function StarPicker({ value = 0, onRate, disabled = false, size = 28 }) {
  return (
    <div className="flex items-center justify-center gap-2" role="radiogroup" aria-label="Rate this agent">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n === 1 ? "" : "s"}`}
          disabled={disabled} onClick={() => onRate(n)} className="p-1 active:scale-90 transition disabled:opacity-50">
          <Star size={size} className={n <= value ? "fill-amber-400 text-amber-400" : "text-white/25"} />
        </button>
      ))}
    </div>
  );
}
