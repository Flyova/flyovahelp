"use client";
import { doc, updateDoc } from "firebase/firestore";
import { Swords } from "lucide-react";
import { db } from "@/lib/firebase";

// Play with Friends: users/{uid}.friendsStayOnline keeps the player in the lobby
// (/api/game/lobby) when they're not on the game page, so friends can still challenge
// them; the challenge reaches them as a notification.
export default function FriendsOnlineCard({ uid, on }) {
  const toggle = () => updateDoc(doc(db, "users", uid), { friendsStayOnline: !on })
    .catch(() => alert("Could not change that setting. Please try again."));

  return (
    <div className="bg-[#142036] rounded-[2rem] p-6 border border-white/5 shadow-xl">
      <div className="flex items-center space-x-2 mb-2">
        <Swords size={18} className="text-[#8B1E3F]" />
        <h3 className="font-black italic uppercase text-sm">Play with Friends</h3>
      </div>
      <label className="flex items-center justify-between gap-4 pt-2 cursor-pointer">
        <span>
          <span className="block text-[12px] font-black uppercase">Always show me online</span>
          <span className="block text-[10px] font-bold text-white/40">
            {on
              ? "Friends see you online and can challenge you, even when you're not on the game page."
              : "You're online only while you're on the Play with Friends page."}
          </span>
        </span>
        <button type="button" role="switch" aria-checked={!!on} onClick={toggle}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? "bg-[#2457D6]" : "bg-white/10"}`}>
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </label>
    </div>
  );
}
