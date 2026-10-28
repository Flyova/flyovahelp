"use client";
import { useState } from "react";
import { CheckCircle, KeyRound, Loader2 } from "lucide-react";
import { authFetch } from "@/lib/authFetch";

const digits = (v) => v.replace(/\D/g, "").slice(0, 4);

function PinField({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="text-[9px] font-black uppercase text-white/40">{label}</span>
      <input
        type="password" inputMode="numeric" maxLength={4} value={value} placeholder="••••"
        onChange={(e) => onChange(digits(e.target.value))}
        className="mt-1 w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3 text-lg font-black tracking-[0.6em] outline-none focus:border-[#2457D6] text-white"
      />
    </label>
  );
}

/** Settings: the 4-digit PIN asked for on every transfer and withdrawal (/api/wallet pinSet, pinReset). */
export default function TxPinCard({ hasTxPin }) {
  const [mode, setMode] = useState(null); // null | "change" | "forgot"
  const [current, setCurrent] = useState("");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const reset = () => {
    setMode(null); setCurrent(""); setCode(""); setPin(""); setAgain(""); setSentTo("");
  };

  const sendCode = async () => {
    setBusy(true);
    setMsg(null);
    const res = await authFetch("/api/wallet", { method: "POST", body: { action: "pinReset" } });
    setBusy(false);
    if (res.error) return setMsg({ ok: false, text: res.error });
    setMode("forgot");
    setSentTo(res.sentTo);
  };

  const save = async (e) => {
    e.preventDefault();
    if (pin !== again) return setMsg({ ok: false, text: "The two PINs don't match." });
    setBusy(true);
    setMsg(null);
    const body = { action: "pinSet", pin, ...(mode === "change" ? { currentPin: current } : {}), ...(mode === "forgot" ? { code } : {}) };
    const res = await authFetch("/api/wallet", { method: "POST", body });
    setBusy(false);
    if (res.error) return setMsg({ ok: false, text: res.error });
    reset();
    setMsg({ ok: true, text: hasTxPin ? "Your new PIN is saved." : "Your PIN is set. You'll need it for transfers and withdrawals." });
  };

  const editing = !hasTxPin || mode;
  const ready = pin.length === 4 && again.length === 4 && (mode !== "change" || current.length === 4) && (mode !== "forgot" || code.length === 6);

  return (
    <div id="security" className="bg-[#142036] rounded-[2rem] p-6 border border-white/5 shadow-xl scroll-mt-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <KeyRound size={18} className="text-[#8B1E3F]" />
          <h3 className="font-black italic uppercase text-sm">Transaction PIN</h3>
        </div>
        {hasTxPin && <span className="flex items-center gap-1 text-[9px] font-black uppercase text-green-500"><CheckCircle size={12} /> Set</span>}
      </div>
      <p className="text-[10px] text-white/50 mb-4 font-bold">
        A 4-digit PIN you type to send a transfer or make a withdrawal, so nobody else can move your money.
      </p>

      {editing ? (
        <form onSubmit={save} className="space-y-3">
          {mode === "change" && <PinField label="Current PIN" value={current} onChange={setCurrent} />}
          {mode === "forgot" && (
            <label className="block">
              <span className="text-[9px] font-black uppercase text-white/40">Code sent to {sentTo}</span>
              <input
                inputMode="numeric" maxLength={6} value={code} placeholder="6-digit code"
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="mt-1 w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3 text-lg font-black tracking-[0.4em] outline-none focus:border-[#2457D6] text-white"
              />
            </label>
          )}
          <PinField label={hasTxPin ? "New PIN" : "Choose a PIN"} value={pin} onChange={setPin} />
          <PinField label="Type it again" value={again} onChange={setAgain} />
          <button type="submit" disabled={!ready || busy} className="w-full bg-[#2457D6] py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest text-white flex items-center justify-center gap-2 disabled:opacity-30">
            {busy && <Loader2 size={14} className="animate-spin" />} {hasTxPin ? "Save New PIN" : "Set PIN"}
          </button>
          {mode && (
            <button type="button" onClick={reset} className="w-full py-3 rounded-2xl bg-white/5 font-black uppercase text-[10px] tracking-widest text-white/50">
              Cancel
            </button>
          )}
        </form>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => { setMsg(null); setMode("change"); }} className="py-4 rounded-2xl bg-[#2457D6] font-black uppercase text-[10px] tracking-widest text-white">
            Change PIN
          </button>
          <button onClick={sendCode} disabled={busy} className="py-4 rounded-2xl bg-white/5 font-black uppercase text-[10px] tracking-widest text-white/70 disabled:opacity-30">
            {busy ? "Sending…" : "Forgot PIN"}
          </button>
        </div>
      )}
      {msg && <p className={`mt-3 text-[11px] font-bold ${msg.ok ? "text-green-500" : "text-red-400"}`}>{msg.text}</p>}
    </div>
  );
}
