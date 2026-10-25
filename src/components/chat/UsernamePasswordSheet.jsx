"use client";
import { useState } from "react";
import { KeyRound, Loader2, LogOut } from "lucide-react";
import { authFetch } from "@/lib/authFetch";
import ChatSheet from "@/components/chat/ChatSheet";

const accountsApi = (body) => authFetch("/api/chat/accounts", { method: "POST", body });
const MIN = 6;

/**
 * The owner's controls for one username's password: set or change it, log every
 * other account out, or remove it (which also logs them out). `info` =
 * { hasPassword, otherAccounts }. Calls `onChanged` after any change.
 */
export default function UsernamePasswordSheet({ username, info, onChanged, onClose }) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState({ type: "", msg: "" });

  const run = async (key, body, done) => {
    setBusy(key);
    setNote({ type: "", msg: "" });
    const r = await accountsApi(body).catch((e) => ({ error: e.message }));
    setBusy("");
    if (r.error) return setNote({ type: "error", msg: r.error });
    setNote({ type: "success", msg: done });
    onChanged();
  };

  const save = (e) => {
    e.preventDefault();
    if (password.length < MIN) return setNote({ type: "error", msg: `Use at least ${MIN} characters.` });
    if (password !== repeat) return setNote({ type: "error", msg: "The two passwords don't match." });
    run("save", { action: "setPassword", username, password }, info.hasPassword ? "Password changed." : "Password set.");
    setPassword("");
    setRepeat("");
  };

  return (
    <ChatSheet label={`Password for @${username}`} onClose={onClose}>
      <form onSubmit={save} className="p-5 pt-7 space-y-3">
        <div className="pr-10">
          <h2 className="text-lg font-black flex items-center gap-2"><KeyRound size={17} /> Password for @{username}</h2>
          <p className="text-xs text-white/50 mt-1 leading-relaxed">
            Anyone with @{username} and this password can log in to it from their own StraWins account and chat as it.
            {" "}{info.otherAccounts ? `${info.otherAccounts} other account${info.otherAccounts === 1 ? " is" : "s are"} logged in now.` : "No other accounts are logged in."}
          </p>
        </div>
        {["New password", "Repeat new password"].map((label, i) => (
          <label key={label} className="block">
            <span className="block text-[10px] font-black uppercase text-white/40 mb-1.5">{label}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={i ? repeat : password}
              onChange={(e) => (i ? setRepeat : setPassword)(e.target.value.slice(0, 64))}
              className="w-full bg-black/40 border border-white/10 focus:border-[#8B1E3F] rounded-xl px-3 py-2.5 text-base outline-none"
            />
          </label>
        ))}
        {note.msg && <p className={`text-xs font-bold ${note.type === "error" ? "text-red-300" : "text-emerald-300"}`}>{note.msg}</p>}
        <button type="submit" disabled={!!busy} className="w-full h-11 rounded-xl bg-[#8B1E3F] text-xs font-black uppercase disabled:opacity-50 flex items-center justify-center gap-2">
          {busy === "save" && <Loader2 size={15} className="animate-spin" />} {info.hasPassword ? "Change password" : "Set password"}
        </button>
        {info.otherAccounts > 0 && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => confirm(`Log every other account out of @${username}?`) && run("out", { action: "logoutOthers", username }, "Other accounts logged out.")}
            className="w-full h-10 rounded-xl bg-white/[0.06] hover:bg-white/10 text-xs font-black uppercase flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <LogOut size={14} /> Log out other accounts
          </button>
        )}
        {info.hasPassword && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => confirm(`Remove the password? Other accounts will be logged out of @${username} and can't log in again.`) && run("remove", { action: "removePassword", username }, "Password removed.")}
            className="w-full h-10 rounded-xl bg-white/[0.05] hover:bg-white/10 text-xs font-black uppercase text-[#FF8A9B] disabled:opacity-50"
          >
            Remove password
          </button>
        )}
      </form>
    </ChatSheet>
  );
}
