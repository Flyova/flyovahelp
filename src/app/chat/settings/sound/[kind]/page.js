"use client";
import { useParams } from "next/navigation";
import { useChat } from "@/components/chat/ChatProvider";
import { SettingsIntro, SettingsLoading, SettingsPage, SettingsRadio, SettingsSection, useSaveSetting } from "@/components/chat/SettingsList";
import { previewTone } from "@/lib/chatSound";
import { CHAT_TONE_TITLES, DEFAULT_TONES, TONES } from "@/lib/chatTones";

const BACK = "/chat/settings/notifications";

/** The sound one kind of message plays for a chat profile. Tapping a sound plays it and picks it. */
export default function SoundPickerPage() {
  const { kind } = useParams();
  const { settingsName: name, settingsFor, settingsLoaded } = useChat();
  const { busy, save } = useSaveSetting();
  const about = CHAT_TONE_TITLES[kind];
  const current = settingsFor(name).sounds.tones?.[kind] || DEFAULT_TONES[kind];

  if (!about) {
    return (
      <SettingsPage title="Sound" back={BACK}>
        <SettingsIntro>There&apos;s no sound to choose here.</SettingsIntro>
      </SettingsPage>
    );
  }
  if (!settingsLoaded) return <SettingsPage title={about.title} back={BACK}><SettingsLoading /></SettingsPage>;

  return (
    <SettingsPage title={about.title} back={BACK}>
      <SettingsIntro>The sound @{name} plays for {about.what}. Tap one to hear it.</SettingsIntro>
      <SettingsSection title="Sounds">
        <div role="radiogroup" aria-label={`${about.title} sound`}>
          {TONES.map((t) => (
            <SettingsRadio
              key={t.id}
              title={t.label}
              text={t.id === DEFAULT_TONES[kind] ? "Default" : undefined}
              on={current === t.id}
              disabled={busy === kind}
              onTap={() => previewTone(t.id)}
              onSelect={() => save(kind, { sounds: { tones: { [kind]: t.id } } })}
            />
          ))}
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
