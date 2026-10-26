"use client";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { Radio } from "lucide-react";
import { db } from "@/lib/firebase";
import { useChat } from "@/components/chat/ChatProvider";
import { SettingsIntro, SettingsLoading, SettingsPage, SettingsSection, SettingsSwitch, useSaveSetting } from "@/components/chat/SettingsList";

/** Whether other players see when this chat profile is online, or when it was last seen. */
export default function OnlineStatusPage() {
  const { settingsName: name, settingsFor, settingsLoaded } = useChat();
  const { busy, save } = useSaveSetting();
  const on = settingsFor(name).showOnline;

  // Switched off: hide it straight away instead of waiting for the next ping.
  const hideNow = () => setDoc(doc(db, "chat_presence", name), { lastActive: serverTimestamp(), hidden: true }).catch(() => null);

  if (!settingsLoaded) return <SettingsPage title="Online status"><SettingsLoading /></SettingsPage>;

  return (
    <SettingsPage title="Online status">
      <SettingsSection>
        <SettingsSwitch icon={Radio} title="Show online status" on={on} disabled={busy === "online"} onChange={(v) => save("online", { showOnline: v }, v ? null : hideNow)} />
      </SettingsSection>
      <SettingsIntro>
        When this is on, players see when @{name} is online, or when it was last seen, in private chats and on its profile. When it&apos;s off, @{name} always
        appears offline.
      </SettingsIntro>
    </SettingsPage>
  );
}
