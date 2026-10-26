"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import {
  Bell, Coins, Eye, Globe2, KeyRound, Link2, LogIn, LogOut, Radio, Shield, SlidersHorizontal, Trash2, UserPlus, Users, Wallet,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/authFetch";
import { COIN_CENTS, formatCents, formatCoins, usernameOffer } from "@/lib/chat";
import { useChat } from "@/components/chat/ChatProvider";
import Avatar from "@/components/Avatar";
import ChatProfileCard from "@/components/settings/ChatProfileCard";
import { clearMyReceipts } from "@/components/settings/ChatPrivacySwitch";
import UsernamePasswordSheet from "@/components/chat/UsernamePasswordSheet";
import { CoinIcon } from "@/components/chat/CoinSheets";

function Section({ id, icon: Icon, title, children }) {
  return (
    <section id={id} className="bg-[#142036] rounded-[2rem] p-5 sm:p-6 border border-white/5 shadow-xl scroll-mt-4">
      <h2 className="flex items-center gap-2 mb-4 font-black italic uppercase text-sm">
        <Icon size={18} className="text-[#8B1E3F]" /> {title}
      </h2>
      {children}
    </section>
  );
}

function SwitchRow({ icon: Icon, title, text, on, onChange, disabled = false }) {
  return (
    <div className="flex items-start justify-between gap-3 bg-black/20 p-3.5 rounded-2xl border border-white/5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[13px] font-bold">{Icon && <Icon size={15} className="text-[#7A9BEE] shrink-0" />}{title}</p>
        {text && <p className="text-[11px] text-white/45 leading-relaxed mt-1">{text}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={`relative shrink-0 mt-0.5 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-[#2457D6]" : "bg-white/15"}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}

/**
 * Chat settings: profile, accounts (your other usernames, adding or buying one,
 * a password for each, logging in to another account's username), the coin
 * wallet, per-chat notification sounds, privacy and settings (online status,
 * hidden country).
 */
export default function ChatSettingsPage() {
  const {
    uid, identities, active, selectIdentity, refreshIdentities, createUsername, deleteUsername, usernamePrice, convos,
    coins, openCoinWallet, chatState, updateChatState, setErr,
  } = useChat();
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [passwordFor, setPasswordFor] = useState(null); // username whose password sheet is open
  const [auth, setAuth] = useState({}); // your usernames -> { hasPassword, otherAccounts }
  const [login, setLogin] = useState({ username: "", password: "" });
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginNote, setLoginNote] = useState({ type: "", msg: "" });
  const [busy, setBusy] = useState("");

  const loadAuth = useCallback(() => authFetch("/api/chat/accounts")
    .then((d) => setAuth(Object.fromEntries((d.items || []).map((x) => [x.username, x]))))
    .catch(() => {}), []);
  useEffect(() => {
    if (uid) loadAuth();
  }, [uid, loadAuth]);

  const logIn = async (e) => {
    e.preventDefault();
    const username = login.username.trim().replace(/^@/, "");
    if (!username || !login.password || loggingIn) return;
    setLoggingIn(true);
    setLoginNote({ type: "", msg: "" });
    const r = await authFetch("/api/chat/accounts", { method: "POST", body: { action: "login", username, password: login.password } })
      .catch((x) => ({ error: x.message }));
    setLoggingIn(false);
    if (r.error) return setLoginNote({ type: "error", msg: r.error });
    setLogin({ username: "", password: "" });
    setLoginNote({ type: "success", msg: `You're now logged in to @${r.username || username}.` });
    await refreshIdentities();
  };

  const logOut = async (name) => {
    if (!confirm(`Log out of @${name}? You'll need its password to log in again.`)) return;
    const r = await authFetch("/api/chat/accounts", { method: "POST", body: { action: "logout", username: name } }).catch((x) => ({ error: x.message }));
    if (r.error) return setErr(r.error);
    if (name === active) selectIdentity(identities.find((i) => i.isDefault)?.usernameLower || "");
    await refreshIdentities();
  };

  const groups = convos.filter((c) => c.type === "group");
  const sounds = chatState.sounds;

  const save = async (key, patch, after) => {
    setBusy(key);
    try {
      await updateChatState(patch);
      await after?.();
    } catch (e) {
      setErr(`Could not save: ${e.message}`);
    }
    setBusy("");
  };

  const add = async (e) => {
    e.preventDefault();
    if (!newName.trim() || adding) return;
    setAdding(true);
    setAddError("");
    const problem = await createUsername(newName.trim().replace(/^@/, ""));
    setAdding(false);
    if (problem) return setAddError(problem);
    setNewName("");
  };

  // Online status off: every one of your usernames shows no online / last seen.
  const hideEverywhere = () => Promise.all(identities.map((i) =>
    setDoc(doc(db, "chat_presence", i.usernameLower), { lastActive: serverTimestamp(), hidden: true }).catch(() => null)));

  return (
    <div className="max-w-2xl space-y-4 pb-6">
      <div className="flex items-center gap-2 text-white/60">
        <SlidersHorizontal size={16} />
        <p className="text-[11px] font-black uppercase tracking-wider">Chat settings</p>
      </div>

      {/* Profile */}
      <ChatProfileCard uid={uid} />

      {/* Accounts */}
      <Section id="accounts" icon={Users} title="Accounts">
        <ul className="rounded-2xl bg-black/20 divide-y divide-white/5">
          {identities.map((i) => {
            const name = i.usernameLower;
            const info = auth[name] || { hasPassword: false, otherAccounts: 0 };
            const labels = i.linked
              ? ["Logged in from another account"]
              : [i.isDefault ? "Main username" : "Extra username", info.hasPassword && "Has a password", info.otherAccounts > 0 && `${info.otherAccounts} other account${info.otherAccounts === 1 ? "" : "s"} logged in`];
            return (
              <li key={name} className="flex flex-wrap items-center gap-x-2.5 gap-y-2 px-3 py-3">
                <Avatar username={name} size={36} rounded="rounded-full" />
                <span className="min-w-0 flex-1 basis-[calc(100%-46px)] sm:basis-0">
                  <span className="flex items-center gap-1.5 text-[13px] font-bold truncate">
                    @{i.username} {i.linked && <Link2 size={12} className="text-white/50" aria-label="logged in from another account" />}
                  </span>
                  <span className="block text-[11px] text-white/45">
                    {[...labels, name === active && "Chatting as this"].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 ml-[46px] sm:ml-0">
                  {name !== active && (
                    <button type="button" onClick={() => selectIdentity(name)} className="h-8 px-3 rounded-lg bg-[#8B1E3F] text-[11px] font-black uppercase">
                      Use
                    </button>
                  )}
                  {i.linked ? (
                    <button type="button" onClick={() => logOut(name)} className="h-8 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/10 flex items-center gap-1 text-[11px] font-bold">
                      <LogOut size={13} /> Log out
                    </button>
                  ) : (
                    <button type="button" onClick={() => setPasswordFor(name)} aria-label={`Password for @${name}`} className="h-8 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/10 flex items-center gap-1 text-[11px] font-bold">
                      <KeyRound size={13} /> Password
                    </button>
                  )}
                  {!i.isDefault && !i.linked && (
                    <button type="button" onClick={() => deleteUsername(name)} aria-label={`Delete @${name}`} className="h-8 w-8 rounded-lg text-red-300/80 hover:text-red-300 hover:bg-white/5 flex items-center justify-center">
                      <Trash2 size={14} />
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>

        <form onSubmit={add} className="mt-4">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase text-white/40 mb-1.5"><UserPlus size={12} /> {usernameOffer(usernamePrice).title}</p>
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/35">@</span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="new username"
                autoComplete="off"
                className="w-full bg-black/40 border border-white/10 focus:border-[#8B1E3F] rounded-xl pl-7 pr-3 py-2.5 text-base md:text-sm outline-none"
              />
            </div>
            <button type="submit" disabled={adding || !newName.trim()} className="shrink-0 bg-[#8B1E3F] px-4 rounded-xl text-xs font-black uppercase disabled:opacity-50">
              {adding ? "…" : usernameOffer(usernamePrice).button}
            </button>
          </div>
          {addError && <p className="text-xs text-red-300 mt-1.5">{addError}</p>}
          <p className="text-[11px] text-white/40 mt-1.5">
            Prices and limits: <Link href="/settings#privacy-policy" className="font-bold text-[#E0708C] hover:underline">Privacy &amp; Policy</Link>
          </p>
        </form>

        <form onSubmit={logIn} className="mt-5">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase text-white/40 mb-1.5"><LogIn size={12} /> Log in to a username</p>
          <p className="text-[11px] text-white/45 mb-2">Have another player&apos;s username and its password? Log in to chat as it from this account.</p>
          <div className="space-y-2">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/35">@</span>
              <input
                value={login.username}
                onChange={(e) => setLogin((l) => ({ ...l, username: e.target.value }))}
                placeholder="username"
                autoComplete="off"
                autoCapitalize="none"
                className="w-full bg-black/40 border border-white/10 focus:border-[#8B1E3F] rounded-xl pl-7 pr-3 py-2.5 text-base md:text-sm outline-none"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={login.password}
                onChange={(e) => setLogin((l) => ({ ...l, password: e.target.value }))}
                placeholder="its password"
                autoComplete="off"
                className="flex-1 min-w-0 bg-black/40 border border-white/10 focus:border-[#8B1E3F] rounded-xl px-3 py-2.5 text-base md:text-sm outline-none"
              />
              <button type="submit" disabled={loggingIn || !login.username.trim() || !login.password} className="shrink-0 bg-[#8B1E3F] px-4 rounded-xl text-xs font-black uppercase disabled:opacity-50">
                {loggingIn ? "…" : "Log in"}
              </button>
            </div>
          </div>
          {loginNote.msg && <p className={`text-xs mt-1.5 ${loginNote.type === "error" ? "text-red-300" : "text-emerald-300"}`}>{loginNote.msg}</p>}
        </form>
      </Section>

      {/* Coin wallet */}
      <Section id="coins" icon={Wallet} title="Coin wallet">
        <div className="flex items-center gap-3 bg-black/20 rounded-2xl p-3.5">
          <CoinIcon size={18} />
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-black leading-tight">{formatCoins(coins)} coins</span>
            <span className="block text-[11px] text-white/45">Worth {formatCents(coins * COIN_CENTS)} · 1 coin = {formatCents(COIN_CENTS)}</span>
          </span>
          <button type="button" onClick={openCoinWallet} className="shrink-0 h-9 px-4 rounded-xl bg-gradient-to-br from-[#F6C453] to-[#D18E1F] text-[#2B1800] text-[11px] font-black uppercase">
            Open
          </button>
        </div>
        <p className="text-[11px] text-white/45 leading-relaxed mt-2">
          Buy coins from your main balance (7% fee) or withdraw them back to it (12% fee). Sending coins is free: tap a player in the Chatroom or a group.
        </p>
      </Section>

      {/* Notifications */}
      <Section id="notifications" icon={Bell} title="Notifications">
        <div className="space-y-2">
          <SwitchRow icon={Radio} title="Chatroom" text="Sound for new messages in the Chatroom." on={sounds.room !== false} disabled={busy === "room"} onChange={(v) => save("room", { sounds: { room: v } })} />
          <SwitchRow icon={Users} title="Private chats" text="Sound for new private messages." on={sounds.private !== false} disabled={busy === "private"} onChange={(v) => save("private", { sounds: { private: v } })} />
          {groups.map((g) => (
            <SwitchRow
              key={g.id}
              title={g.groupName || "Group"}
              text="Sound for new messages in this group."
              on={sounds.groups?.[g.id] !== false}
              disabled={busy === g.id}
              onChange={(v) => save(g.id, { sounds: { groups: { [g.id]: v } } })}
            />
          ))}
        </div>
        <p className="text-[11px] text-white/40 mt-2">Sounds play while Chats is open.</p>
      </Section>

      {/* Privacy */}
      <Section id="privacy" icon={Shield} title="Privacy">
        <div className="space-y-2">
          <SwitchRow
            icon={Eye}
            title="Read receipts"
            text="Let people see your avatar under the messages you've read. Off: you won't see theirs either."
            on={chatState.readReceipts}
            disabled={busy === "receipts"}
            onChange={(v) => save("receipts", { readReceipts: v }, v ? null : () => clearMyReceipts(uid))}
          />
          <SwitchRow
            icon={Coins}
            title="Show off your coins"
            text="Show your coin balance on your chat profile for other players to see."
            on={chatState.showCoins}
            disabled={busy === "coins"}
            onChange={(v) => save("coins", { showCoins: v })}
          />
        </div>
      </Section>

      {/* Settings */}
      <Section id="settings" icon={SlidersHorizontal} title="Settings">
        <div className="space-y-2">
          <SwitchRow
            icon={Radio}
            title="Online status"
            text="Show when you're online, or when you were last seen. Off: you always appear offline."
            on={chatState.showOnline}
            disabled={busy === "online"}
            onChange={(v) => save("online", { showOnline: v }, v ? null : hideEverywhere)}
          />
          <SwitchRow
            icon={Globe2}
            title="Hide country"
            text="Don't show your country on your chat profile or in player search."
            on={chatState.hideCountry}
            disabled={busy === "country"}
            onChange={(v) => save("country", { hideCountry: v })}
          />
          <div className="flex items-start gap-3 bg-black/20 p-3.5 rounded-2xl border border-white/5">
            <KeyRound size={15} className="text-[#7A9BEE] shrink-0 mt-0.5" />
            <p className="text-[11px] text-white/55 leading-relaxed">
              <span className="block text-[13px] font-bold text-white mb-0.5">Password for each chat account</span>
              Give any of your usernames a password under <a href="#accounts" className="font-bold text-[#E0708C] hover:underline">Accounts</a>. Anyone with the username and its password can log in to it from their own StraWins account and chat as it, until they log out or you log them out.
            </p>
          </div>
        </div>
      </Section>

      {passwordFor && (
        <UsernamePasswordSheet
          username={passwordFor}
          info={auth[passwordFor] || { hasPassword: false, otherAccounts: 0 }}
          onChanged={loadAuth}
          onClose={() => setPasswordFor(null)}
        />
      )}
    </div>
  );
}
