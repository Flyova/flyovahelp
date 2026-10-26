"use client";
import { useChat } from "@/components/chat/ChatProvider";
import ChatProfileCard from "@/components/settings/ChatProfileCard";
import { SettingsPage } from "@/components/chat/SettingsList";

/** Photo, bio, status and gender of the chat profile Chat settings is showing. */
export default function ProfileSettingsPage() {
  const { uid, settingsName } = useChat();
  return (
    <SettingsPage title="Profile">
      {settingsName && <ChatProfileCard uid={uid} username={settingsName} bare />}
    </SettingsPage>
  );
}
