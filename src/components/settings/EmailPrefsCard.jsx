"use client";
import { doc, updateDoc } from "firebase/firestore";
import { Lock, Mail } from "lucide-react";
import { db } from "@/lib/firebase";
import { ALWAYS_ON_EMAILS, EMAIL_KINDS, emailKindOn } from "@/lib/emailPrefs";

// One switch per kind of email (lib/emailPrefs). Off = the server doesn't send that
// kind to this account; codes and links for keeping the account always come.
export default function EmailPrefsCard({ uid, prefs }) {
  const toggle = (key, on) => updateDoc(doc(db, "users", uid), { [`emailPrefs.${key}`]: on })
    .catch(() => alert("Could not change that setting. Please try again."));

  return (
    <div className="bg-[#142036] rounded-[2rem] p-6 border border-white/5 shadow-xl" data-testid="email-prefs">
      <div className="flex items-center space-x-2 mb-2">
        <Mail size={18} className="text-[#8B1E3F]" />
        <h3 className="font-black italic uppercase text-sm">Email Notifications</h3>
      </div>
      <p className="text-[10px] text-white/50 mb-4 font-bold">Choose which emails StraWins sends to your address.</p>
      <div className="divide-y divide-white/5">
        {EMAIL_KINDS.map(([key, label, hint]) => {
          const on = emailKindOn(prefs, key);
          return (
            <label key={key} className="flex items-center justify-between gap-4 py-3 cursor-pointer">
              <span>
                <span className="block text-[12px] font-black uppercase">{label}</span>
                <span className="block text-[10px] font-bold text-white/40">{hint}</span>
              </span>
              <button type="button" role="switch" aria-checked={on} aria-label={`${label} emails`} onClick={() => toggle(key, !on)}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? "bg-[#2457D6]" : "bg-white/10"}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </label>
          );
        })}
        <div className="flex items-center justify-between gap-4 py-3">
          <span>
            <span className="block text-[12px] font-black uppercase">Security &amp; account</span>
            <span className="block text-[10px] font-bold text-white/40">{ALWAYS_ON_EMAILS}</span>
          </span>
          <span className="flex items-center gap-1 text-[9px] font-black uppercase text-white/40 shrink-0">
            <Lock size={12} /> Always on
          </span>
        </div>
      </div>
    </div>
  );
}
