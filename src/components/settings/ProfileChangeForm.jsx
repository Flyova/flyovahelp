"use client";
import { useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { authFetch } from "@/lib/authFetch";

/**
 * Changing the account name or email: a link is emailed to the current address and
 * the change is made when it's opened (/api/account profileChangeRequest).
 */
export default function ProfileChangeForm({ fullName, email }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(fullName || "");
  const [mail, setMail] = useState(email || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  // A plain button, not a form: this sits inside Settings' profile form.
  const send = async () => {
    setBusy(true);
    setMsg(null);
    const res = await authFetch("/api/account", { method: "POST", body: { action: "profileChangeRequest", fullName: name, email: mail } });
    setBusy(false);
    if (res.error) return setMsg({ ok: false, text: res.error });
    setOpen(false);
    setMsg({ ok: true, text: `We emailed a link to ${res.sentTo}. Open it to confirm the change.` });
  };

  // Enter sends this request, not the profile form around it.
  const onKey = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      send();
    }
  };
  const field = "w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-[#2457D6] text-white";
  return (
    <div className="space-y-3">
      {open ? (
        <div className="bg-black/20 p-4 rounded-2xl border border-white/5 space-y-3">
          <p className="text-[10px] font-bold text-white/50">We&apos;ll email a confirmation link to your current address. Nothing changes until you open it.</p>
          <label className="block">
            <span className="text-[9px] font-black uppercase text-white/40">Full name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onKey} className={`mt-1 ${field}`} />
          </label>
          <label className="block">
            <span className="text-[9px] font-black uppercase text-white/40">Email</span>
            <input type="email" value={mail} onChange={(e) => setMail(e.target.value)} onKeyDown={onKey} className={`mt-1 ${field}`} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setOpen(false)} className="py-3 rounded-2xl bg-white/5 font-black uppercase text-[10px] tracking-widest text-white/50">Cancel</button>
            <button type="button" onClick={send} disabled={busy} className="py-3 rounded-2xl bg-[#2457D6] font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 disabled:opacity-40">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <MailCheck size={14} />} Email Me a Link
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => { setMsg(null); setName(fullName || ""); setMail(email || ""); setOpen(true); }}
          className="w-full py-3 rounded-2xl bg-white/5 border border-white/5 font-black uppercase text-[10px] tracking-widest text-white/70">
          Change Name or Email
        </button>
      )}
      {msg && <p className={`text-[11px] font-bold ${msg.ok ? "text-green-500" : "text-red-400"}`}>{msg.text}</p>}
    </div>
  );
}
