"use client";
import { useState } from "react";
import { Ban, Bell, Check, ChevronDown, Info, KeyRound, LifeBuoy, LogIn, Radio, Shield, UserPlus, UserRound, Users, Wallet } from "lucide-react";
import { formatCoins } from "@/lib/chat";
import { useChat } from "@/components/chat/ChatProvider";
import Avatar from "@/components/Avatar";
import { SettingsPage, SettingsRow, SettingsSearch, SettingsSection } from "@/components/chat/SettingsList";

const onOff = (on) => (on ? "On" : "Off");

/** Which chat profile the settings below are for, with a switcher when you have more than one. */
function ProfileSwitcher() {
  const { identities, settingsName, setSettingsName, active } = useChat();
  const [open, setOpen] = useState(false);
  const current = identities.find((i) => i.usernameLower === settingsName);
  if (!settingsName) return null;

  return (
    <div className="px-4 pt-1 pb-3">
      <button
        type="button"
        disabled={identities.length < 2}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3.5 p-3 rounded-2xl bg-white/[0.05] hover:bg-white/[0.08] disabled:hover:bg-white/[0.05] text-left transition-colors"
      >
        <Avatar username={settingsName} size={48} rounded="rounded-full" />
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-bold truncate">@{current?.username || settingsName}</span>
          <span className="block text-[12.5px] text-white/50">
            {settingsName === active ? "Chatting as this profile" : "Settings for this chat profile"}
          </span>
        </span>
        {identities.length > 1 && (
          <span className="shrink-0 flex items-center gap-1 text-[13px] font-semibold text-[#8FB0FF]">
            Switch <ChevronDown size={15} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </span>
        )}
      </button>
      {open && (
        <ul className="chat-slide-up mt-2 rounded-2xl bg-white/[0.04] overflow-hidden">
          {identities.map((i) => (
            <li key={i.usernameLower}>
              <button
                type="button"
                onClick={() => {
                  setSettingsName(i.usernameLower);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.05]"
              >
                <Avatar username={i.usernameLower} size={34} rounded="rounded-full" />
                <span className="min-w-0 flex-1 text-[15px] font-semibold truncate">@{i.username}</span>
                {i.usernameLower === settingsName && <Check size={18} className="text-[#8FB0FF]" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Chat settings, laid out like a phone's settings: a search box, the chat profile
 * the settings are for (each username has its own), then sections of rows that
 * each open their own page.
 */
export default function ChatSettingsPage() {
  const { identities, active, usernamePrice, coins, openCoinWallet, blockedNames, convos, settingsName, settingsFor, settingsLoaded } = useChat();
  const [q, setQ] = useState("");

  const name = settingsName;
  const s = settingsFor(name);
  const groups = convos.filter((c) => c.type === "group" && (c.participants || []).includes(name));
  const soundSwitches = [s.sounds.room !== false, s.sounds.private !== false, ...groups.map((g) => s.sounds.groups?.[g.id] !== false)];
  const soundsValue = soundSwitches.every(Boolean) ? "On" : soundSwitches.some(Boolean) ? "Custom" : "Off";
  const linked = identities.find((i) => i.usernameLower === name)?.linked;

  const sections = name
    ? [
        {
          title: `Settings for @${name}`,
          rows: [
            { key: "profile", icon: UserRound, title: "Profile", text: "Photo, bio and status", href: "/chat/settings/profile", words: "picture photo avatar bio status devices" },
            { key: "notifications", icon: Bell, title: "Notifications", text: "Message sounds for the Chatroom, private chats and groups", value: settingsLoaded ? soundsValue : "", href: "/chat/settings/notifications", words: "sound mute alert" },
            { key: "online", icon: Radio, title: "Online status", text: "Show when you're online or last seen", value: settingsLoaded ? onOff(s.showOnline) : "", href: "/chat/settings/online-status", words: "last seen active offline" },
            { key: "privacy", icon: Shield, title: "Privacy", text: "Read receipts, coins on show, country, who can add you to groups", href: "/chat/settings/privacy", words: "seen read receipts show off coins hide country groups add" },
            { key: "blocked", icon: Ban, title: "Blocked", text: "Players this profile has blocked", value: name === active ? blockedNames.length || "" : "", href: "/chat/settings/blocked", words: "unblock block" },
            {
              key: "password",
              icon: KeyRound,
              title: linked ? "Log out of this username" : "Password",
              text: linked ? "You logged in to it from another account" : "Let other accounts log in to this username",
              href: `/chat/settings/accounts/${encodeURIComponent(name)}`,
              words: "password login log out security",
            },
          ],
        },
      ]
    : [];
  sections.push(
    {
      title: "All your chat profiles",
      rows: [
        { key: "accounts", icon: Users, title: "Accounts", text: "Your usernames and the ones you've logged in to", value: identities.length || "", href: "/chat/settings/accounts", words: "usernames delete switch use" },
        {
          key: "add",
          icon: UserPlus,
          title: "Add a username",
          text: usernamePrice > 0 ? `Buy another chat username for $${usernamePrice} from your wallet` : "Add another chat username",
          value: usernamePrice === 0 ? "Free" : usernamePrice > 0 ? `$${usernamePrice}` : "",
          href: "/chat/settings/add-username",
          words: "buy create new username",
        },
        { key: "login", icon: LogIn, title: "Log in to a username", text: "Chat as another player's username with its password", href: "/chat/settings/login", words: "password other account" },
        { key: "coins", icon: Wallet, title: "Coin wallet", text: "Buy, withdraw and see your coin activity", value: `${formatCoins(coins)} coins`, onClick: openCoinWallet, chevron: true, words: "buy withdraw send balance money" },
      ],
    },
    {
      title: "More info and support",
      rows: [
        { key: "prices", icon: Info, title: "Username prices and limits", href: "/chat/settings/prices", words: "buy cost free agent" },
        { key: "help", icon: LifeBuoy, title: "Help and support", href: "/support", words: "contact report problem" },
      ],
    }
  );

  const term = q.trim().toLowerCase();
  const shown = sections
    .map((sec) => ({ ...sec, rows: term ? sec.rows.filter((r) => `${r.title} ${r.text || ""} ${r.words || ""}`.toLowerCase().includes(term)) : sec.rows }))
    .filter((sec) => sec.rows.length);

  return (
    <SettingsPage title="Chat settings" back="/chat">
      <SettingsSearch value={q} onChange={setQ} />
      {!term && <ProfileSwitcher />}
      {shown.map((sec) => (
        <SettingsSection key={sec.title} title={sec.title}>
          {sec.rows.map((r) => (
            <SettingsRow key={r.key} icon={r.icon} title={r.title} text={r.text} value={r.value} href={r.href} onClick={r.onClick} chevron={r.chevron} />
          ))}
        </SettingsSection>
      ))}
      {!shown.length && <p className="px-4 py-10 text-center text-sm text-white/50">No settings match “{q.trim()}”.</p>}
    </SettingsPage>
  );
}
