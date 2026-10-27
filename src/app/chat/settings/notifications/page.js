"use client";
import { Coins, MessageCircle, Radio, Users } from "lucide-react";
import { useChat } from "@/components/chat/ChatProvider";
import Avatar from "@/components/Avatar";
import { GroupAvatar } from "@/components/chat/GroupForm";
import { SettingsIntro, SettingsLoading, SettingsPage, SettingsRow, SettingsSection, SettingsSwitch, useSaveSetting } from "@/components/chat/SettingsList";
import { CHAT_TONE_KINDS, CHAT_TONE_TITLES, toneLabel } from "@/lib/chatTones";

const TONE_ICONS = { private: MessageCircle, groups: Users, room: Radio, coins: Coins };

/**
 * Message sounds for one chat profile: which sound each kind plays, and whether the
 * Chatroom, private chats, each group and players muted from their profile play one.
 */
export default function NotificationSettingsPage() {
  const { settingsName: name, settingsFor, myConvos, settingsLoaded } = useChat();
  const { busy, save } = useSaveSetting();
  const { sounds } = settingsFor(name);
  const groups = myConvos.filter((c) => c.type === "group" && (c.participants || []).includes(name));
  const muted = Object.keys(sounds.people || {}).filter((p) => sounds.people[p] === false).sort();

  if (!settingsLoaded) return <SettingsPage title="Notifications"><SettingsLoading /></SettingsPage>;

  return (
    <SettingsPage title="Notifications">
      <SettingsIntro>
        Message sounds for @{name}. Sounds play while Chats is open; in the StraWins app, push notifications play them too, and those from chats you&apos;ve turned off arrive silently.
      </SettingsIntro>
      <SettingsSection title="Sounds">
        {CHAT_TONE_KINDS.map((k) => (
          <SettingsRow key={k} icon={TONE_ICONS[k]} title={CHAT_TONE_TITLES[k].title} value={toneLabel(sounds.tones?.[k])} href={`/chat/settings/sound/${k}`} />
        ))}
      </SettingsSection>
      <SettingsSection title="Play sounds for">
        <SettingsSwitch icon={Radio} title="Chatroom" text="New messages in the Chatroom" on={sounds.room !== false} disabled={busy === "room"} onChange={(v) => save("room", { sounds: { room: v } })} />
        <SettingsSwitch icon={MessageCircle} title="Private chats" text="New private messages" on={sounds.private !== false} disabled={busy === "private"} onChange={(v) => save("private", { sounds: { private: v } })} />
      </SettingsSection>
      <SettingsSection title="Groups" note={groups.length ? null : `@${name} isn't in any groups yet.`}>
        {groups.map((g) => (
          <SettingsSwitch
            key={g.id}
            icon={<GroupAvatar size={28} />}
            title={g.groupName || "Group"}
            text={`${(g.participants || []).length} members`}
            on={sounds.groups?.[g.id] !== false}
            disabled={busy === g.id}
            onChange={(v) => save(g.id, { sounds: { groups: { [g.id]: v } } })}
          />
        ))}
      </SettingsSection>
      {muted.length > 0 && (
        <SettingsSection title="Muted players" note="No sound for their private messages. Mute or unmute anyone from their profile.">
          {muted.map((p) => (
            <SettingsRow
              key={p}
              icon={<Avatar username={p} size={28} rounded="rounded-full" />}
              title={`@${p}`}
              trailing={(
                <button
                  type="button"
                  disabled={busy === `p:${p}`}
                  onClick={() => save(`p:${p}`, { sounds: { people: { [p]: true } } })}
                  className="shrink-0 h-8 px-3.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] text-[13px] font-bold disabled:opacity-50"
                >
                  Unmute
                </button>
              )}
            />
          ))}
        </SettingsSection>
      )}
    </SettingsPage>
  );
}
