"use client";
import { useState } from "react";
import { Landmark, Loader2 } from "lucide-react";
import { authFetch } from "@/lib/authFetch";

/**
 * Settings: the bank account a player trades with agents from (/api/wallet bankSet).
 * It must be in the account's own name, so the beneficiary is always the full name.
 */
export default function BankAccountCard({ bank, fullName, hasTxPin }) {
  const [editing, setEditing] = useState(false);
  const [bankName, setBankName] = useState(bank?.bankName || "");
  const [accountNumber, setAccountNumber] = useState(bank?.accountNumber || "");
  const [txPin, setTxPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await authFetch("/api/wallet", { method: "POST", body: { action: "bankSet", bankName, accountNumber, txPin } });
    setBusy(false);
    setTxPin("");
    if (res.error) return setMsg({ ok: false, text: res.error });
    setEditing(false);
    setMsg({ ok: true, text: "Bank account saved." });
  };

  const field = "mt-1 w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:border-[#2457D6] text-white";

  return (
    <div className="bg-[#142036] rounded-[2rem] p-6 border border-white/5 shadow-xl">
      <div className="flex items-center space-x-2 mb-2">
        <Landmark size={18} className="text-[#8B1E3F]" />
        <h3 className="font-black italic uppercase text-sm">Bank Account</h3>
      </div>
      <p className="text-[10px] text-white/50 mb-4 font-bold">
        Needed before you deposit or withdraw with an agent. It must be in your account&apos;s name: {fullName || "your full name"}.
      </p>

      {bank && !editing ? (
        <div className="space-y-3">
          <div className="bg-black/20 p-4 rounded-2xl border border-white/5 space-y-1">
            <p className="text-sm font-black">{bank.bankName}</p>
            <p className="font-mono text-sm tracking-widest text-white/70">{bank.accountNumber}</p>
            <p className="text-[10px] font-black uppercase text-white/40">Beneficiary: {bank.accountName}</p>
          </div>
          <button onClick={() => setEditing(true)} className="w-full py-4 rounded-2xl bg-white/5 font-black uppercase text-[10px] tracking-widest text-white/70">
            Change Bank Account
          </button>
        </div>
      ) : (
        <form onSubmit={save} className="space-y-3">
          <label className="block">
            <span className="text-[9px] font-black uppercase text-white/40">Bank name</span>
            <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Chase Bank" className={field} />
          </label>
          <label className="block">
            <span className="text-[9px] font-black uppercase text-white/40">Account number</span>
            <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} inputMode="numeric" placeholder="Account number" className={`${field} font-mono tracking-widest`} />
          </label>
          <label className="block opacity-60">
            <span className="text-[9px] font-black uppercase text-white/40">Beneficiary name</span>
            <input value={fullName || ""} readOnly className={`${field} cursor-not-allowed`} />
          </label>
          {hasTxPin && (
            <label className="block">
              <span className="text-[9px] font-black uppercase text-white/40">Your 4-digit PIN</span>
              <input type="password" inputMode="numeric" maxLength={4} value={txPin} placeholder="••••"
                onChange={(e) => setTxPin(e.target.value.replace(/\D/g, "").slice(0, 4))} className={`${field} tracking-[0.6em]`} />
            </label>
          )}
          <button type="submit" disabled={busy || !bankName.trim() || !accountNumber.trim() || (hasTxPin && txPin.length !== 4)}
            className="w-full bg-[#2457D6] py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest text-white flex items-center justify-center gap-2 disabled:opacity-30">
            {busy && <Loader2 size={14} className="animate-spin" />} Save Bank Account
          </button>
          {bank && (
            <button type="button" onClick={() => setEditing(false)} className="w-full py-3 rounded-2xl bg-white/5 font-black uppercase text-[10px] tracking-widest text-white/50">
              Cancel
            </button>
          )}
        </form>
      )}
      {msg && <p className={`mt-3 text-[11px] font-bold ${msg.ok ? "text-green-500" : "text-red-400"}`}>{msg.text}</p>}
    </div>
  );
}
