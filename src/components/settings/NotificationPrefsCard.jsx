"use client";
import { doc, updateDoc } from "firebase/firestore";
import { Bell } from "lucide-react";
import { db } from "@/lib/firebase";

// One switch per kind of notification (lib/notifications on the server). Off = no
// phone push for it; it still shows on the Notifications page.
const KINDS = [
  ["group", "Group messages", "New messages in your groups"],
  ["message", "Private messages", "New private chat messages"],
  ["merchant", "Agent trades", "Deposits and withdrawals with agents"],
  ["game", "Game updates", "Challenges, match results and game news"],
  ["account", "Account activity", "PIN, bank, username and sign-up changes"],
  ["info", "Info", "General news from StraWins"],
  ["success", "Success", "Money received, deposits approved"],
  ["warning", "Warnings", "Declined payments, locks and important notices"],
];

export default function NotificationPrefsCard({ uid, prefs }) {
  const toggle = (key, on) => updateDoc(doc(db, "users", uid), { [`notificationPrefs.${key}`]: on })
    .catch(() => alert("Could not change that setting. Please try again."));

  return (
    <div className="bg-[#142036] rounded-[2rem] p-6 border border-white/5 shadow-xl">
      <div className="flex items-center space-x-2 mb-2">
        <Bell size={18} className="text-[#8B1E3F]" />
        <h3 className="font-black italic uppercase text-sm">Notifications</h3>
      </div>
      <p className="text-[10px] text-white/50 mb-4 font-bold">Choose which activities send a notification to your phone. Everything still shows on your Notifications page.</p>
      <div className="divide-y divide-white/5">
        {KINDS.map(([key, label, hint]) => {
          const on = prefs?.[key] !== false;
          return (
            <label key={key} className="flex items-center justify-between gap-4 py-3 cursor-pointer">
              <span>
                <span className="block text-[12px] font-black uppercase">{label}</span>
                <span className="block text-[10px] font-bold text-white/40">{hint}</span>
              </span>
              <button type="button" role="switch" aria-checked={on} onClick={() => toggle(key, !on)}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? "bg-[#2457D6]" : "bg-white/10"}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </label>
          );
        })}
      </div>
    </div>
  );
}
