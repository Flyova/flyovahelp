"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Ban, CalendarDays, Coins, Flag, Loader2, MapPin, MessageCircle, X } from "lucide-react";
import Avatar from "@/components/Avatar";
import { authFetch } from "@/lib/authFetch";
import { formatCoins } from "@/lib/chat";

/**
 * A player's chat profile, opened by tapping their avatar or name: big avatar,
 * name, status, bio, country, join date and (if they show them off) their coins,
 * with Send message / Send coins / Block / Report. `onSendCoins` only where coins
 * can be sent (Chatroom and groups). A centred card on desktop, a bottom sheet on
 * phones. Key it by username.
 */
export default function ProfileSheet({ username, onClose, onMessage, onSendCoins, onBlock, onReport }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    authFetch(`/api/chat/profile?u=${encodeURIComponent(username)}`)
      .then((r) => live && (r.error ? setError(r.error) : setProfile(r)))
      .catch(() => live && setError("Could not load this profile."));
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      live = false;
      document.removeEventListener("keydown", onKey);
    };
  }, [username, onClose]);

  if (typeof document === "undefined") return null;
  const wide = window.matchMedia("(min-width: 640px)").matches;
  const name = profile?.fullName || "";
  const joined = profile?.memberSince
    ? new Date(profile.memberSince).toLocaleDateString([], { month: "long", year: "numeric" })
    : "";
  const act = (fn) => () => {
    onClose();
    fn(username);
  };

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={`@${username}'s profile`}>
      <div className="chat-backdrop absolute inset-0 bg-[#060b14]/55 backdrop-blur-[3px]" onClick={onClose} />
      <div className={`${wide ? "chat-pop rounded-3xl" : "chat-sheet rounded-t-3xl"} relative w-full sm:w-[380px] max-h-[88vh] overflow-y-auto bg-[#142036] border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.6)]`}>
        <div className="h-24 bg-gradient-to-br from-[#8B1E3F] via-[#4A1A3A] to-[#2457D6]/70" />
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 w-9 h-9 rounded-full bg-black/30 hover:bg-black/45 flex items-center justify-center text-white">
          <X size={18} />
        </button>
        {!wide && <span className="absolute left-1/2 top-2 -translate-x-1/2 w-10 h-1 rounded-full bg-white/40" aria-hidden="true" />}

        <div className="px-6 pb-6 -mt-12 flex flex-col items-center text-center">
          <div className="p-1 rounded-full bg-[#142036]">
            <Avatar username={username} size={96} rounded="rounded-full" />
          </div>
          <h2 className="mt-3 text-xl font-black leading-tight break-all">@{profile?.username || username}</h2>
          {name && <p className="text-sm text-white/60 mt-0.5">{name}</p>}
          {profile?.coins != null && (
            <span className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-br from-[#F6C453] to-[#D18E1F] text-[#2B1800] text-xs font-black">
              <Coins size={13} /> {formatCoins(profile.coins)} coins
            </span>
          )}
          {profile?.status && (
            <span className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] text-xs text-white/80">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {profile.status}
            </span>
          )}

          {!profile && !error && <Loader2 size={20} className="animate-spin text-white/40 mt-6" />}
          {error && <p className="text-sm text-red-300 mt-5">{error}</p>}

          {profile && (
            <>
              {profile.bio && <p className="mt-4 text-[14px] leading-relaxed text-white/80 whitespace-pre-wrap break-words">{profile.bio}</p>}
              <div className="mt-4 w-full rounded-2xl bg-black/20 divide-y divide-white/5 text-left">
                {profile.country && (
                  <p className="flex items-center gap-3 px-4 py-3 text-sm"><MapPin size={16} className="text-white/40" />{profile.country}</p>
                )}
                {joined && (
                  <p className="flex items-center gap-3 px-4 py-3 text-sm"><CalendarDays size={16} className="text-white/40" />Joined {joined}</p>
                )}
                {!profile.bio && !profile.country && !joined && <p className="px-4 py-3 text-sm text-white/40">No profile details yet.</p>}
              </div>

              {profile.isYou ? (
                <Link href="/settings#chat-profile" onClick={onClose} className="mt-5 w-full h-11 rounded-xl bg-white/10 hover:bg-white/15 flex items-center justify-center text-sm font-black uppercase">
                  Edit your bio &amp; status
                </Link>
              ) : (
                <>
                  {onMessage && (
                    <button type="button" onClick={act(onMessage)} className="mt-5 w-full h-11 rounded-xl bg-gradient-to-br from-[#A0284D] to-[#6E1732] flex items-center justify-center gap-2 text-sm font-black uppercase shadow-[0_8px_24px_-8px_rgba(139,30,63,0.9)]">
                      <MessageCircle size={17} /> Send message
                    </button>
                  )}
                  {onSendCoins && (
                    <button type="button" onClick={act(onSendCoins)} className="mt-2 w-full h-11 rounded-xl bg-gradient-to-br from-[#F6C453] to-[#D18E1F] text-[#2B1800] flex items-center justify-center gap-2 text-sm font-black uppercase">
                      <Coins size={17} /> Send coins
                    </button>
                  )}
                  {(onBlock || onReport) && (
                    <div className="mt-2 w-full grid grid-cols-2 gap-2">
                      {onBlock && (
                        <button type="button" onClick={act(onBlock)} className="h-10 rounded-xl bg-white/[0.05] hover:bg-white/10 flex items-center justify-center gap-2 text-xs font-bold text-[#FF8A9B]">
                          <Ban size={15} /> Block
                        </button>
                      )}
                      {onReport && (
                        <button type="button" onClick={act(onReport)} className="h-10 rounded-xl bg-white/[0.05] hover:bg-white/10 flex items-center justify-center gap-2 text-xs font-bold text-[#FF8A9B]">
                          <Flag size={15} /> Report
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
