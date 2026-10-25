"use client";
import { useState } from "react";
import Link from "next/link";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import {
  Bell, Coins, Eye, Globe2, KeyRound, Lock, LockOpen, Radio, Shield, SlidersHorizontal, Trash2, UserPlus, Users, Wallet,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { COIN_CENTS, formatCents, formatCoins } from "@/lib/chat";
import { useChat } from "@/components/chat/ChatProvider";
import Avatar from "@/components/Avatar";
import ChatProfileCard from "@/components/settings/ChatProfileCard";
import { clearMyReceipts } from "@/components/settings/ChatPrivacySwitch";
import { ManagePinSheet } from "@/components/chat/PinSheet";
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
 * and a PIN for each), the coin wallet, per-chat notification sounds, privacy and
 * settings (online status, hidden country).
 */
export default function ChatSettingsPage() {
  const {
    uid, identities, active, selectIdentity, createUsername, deleteUsername, convos,
    coins, openCoinWallet, chatState, updateChatState, locked, isLocked, lockNow, refreshLocks, markUnlocked, setErr,
  } = useChat();
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [pinFor, setPinFor] = useState(null); // username whose PIN sheet is open
  const [busy, setBusy] = useState("");

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
            const hasPin = locked.includes(name);
            const lockedNow = isLocked(name);
            return (
              <li key={name} className="flex flex-wrap items-center gap-x-2.5 gap-y-2 px-3 py-3">
                <Avatar username={name} size={36} rounded="rounded-full" />
                <span className="min-w-0 flex-1 basis-[calc(100%-46px)] sm:basis-0">
                  <span className="flex items-center gap-1.5 text-[13px] font-bold truncate">
                    @{i.username} {hasPin && <Lock size={12} className="text-white/50" aria-label="has a PIN" />}
                  </span>
                  <span className="block text-[11px] text-white/45">
                    {[i.isDefault && "Main username", name === active && "Chatting as this", lockedNow && "Locked"].filter(Boolean).join(" · ") || "Extra username"}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 ml-[46px] sm:ml-0">
                  {name !== active && (
                    <button type="button" onClick={() => selectIdentity(name)} className="h-8 px-3 rounded-lg bg-[#8B1E3F] text-[11px] font-black uppercase">
                      {lockedNow ? "Unlock" : "Use"}
                    </button>
                  )}
                  {!i.isDefault && (
                    <button type="button" onClick={() => setPinFor(name)} aria-label={hasPin ? `Change PIN for @${name}` : `Set a PIN for @${name}`} className="h-8 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/10 flex items-center gap-1 text-[11px] font-bold">
                      <KeyRound size={13} /> {hasPin ? "PIN" : "Set PIN"}
                    </button>
                  )}
                  {hasPin && !lockedNow && (
                    <button type="button" onClick={() => lockNow(name)} aria-label={`Lock @${name} now`} className="h-8 w-8 rounded-lg bg-white/[0.06] hover:bg-white/10 flex items-center justify-center">
                      <LockOpen size={14} />
                    </button>
                  )}
                  {!i.isDefault && (
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
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase text-white/40 mb-1.5"><UserPlus size={12} /> Add or buy a username</p>
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
              {adding ? "…" : "Buy"}
            </button>
          </div>
          {addError && <p className="text-xs text-red-300 mt-1.5">{addError}</p>}
          <p className="text-[11px] text-white/40 mt-1.5">
            Prices and limits: <Link href="/settings#privacy-policy" className="font-bold text-[#E0708C] hover:underline">Privacy &amp; Policy</Link>
          </p>
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
              Give any of your extra usernames its own PIN under <a href="#accounts" className="font-bold text-[#E0708C] hover:underline">Accounts</a>. A locked username, and its chats, stay hidden until the PIN is entered.
            </p>
          </div>
        </div>
      </Section>

      {pinFor && (
        <ManagePinSheet
          username={pinFor}
          isLocked={locked.includes(pinFor)}
          onDone={() => {
            markUnlocked(pinFor); // a PIN you just set doesn't lock you out right away
            refreshLocks();
          }}
          onClose={() => setPinFor(null)}
        />
      )}
    </div>
  );
}
