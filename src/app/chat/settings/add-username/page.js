"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usernameOffer } from "@/lib/chat";
import { useChat } from "@/components/chat/ChatProvider";
import { SettingsButton, SettingsInput, SettingsIntro, SettingsMessage, SettingsPage } from "@/components/chat/SettingsList";

/** Add (free) or buy another chat username. */
export default function AddUsernamePage() {
  const router = useRouter();
  const { createUsername, usernamePrice, flashNotice } = useChat();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const offer = usernameOffer(usernamePrice);

  const add = async (e) => {
    e.preventDefault();
    const username = name.trim().replace(/^@/, "");
    if (!username || busy) return;
    setBusy(true);
    setError("");
    const problem = await createUsername(username);
    setBusy(false);
    if (problem) return setError(problem);
    flashNotice(`@${username} is ready to use.`);
    router.replace("/chat/settings/accounts");
  };

  return (
    <SettingsPage title="Add a username">
      <SettingsIntro>
        {offer.title}. Each username is its own chat profile with its own chats and settings.{" "}
        <Link href="/settings#privacy-policy" className="font-semibold text-[#8FB0FF] hover:underline">Prices and limits</Link>
      </SettingsIntro>
      <form onSubmit={add} className="px-4 pb-5 pt-1 space-y-3">
        <SettingsInput label="Username" prefix="@" value={name} onChange={(e) => setName(e.target.value)} placeholder="new username" autoComplete="off" autoCapitalize="none" spellCheck={false} />
        <p className="text-[12px] text-white/45">3–30 letters, numbers, dots or underscores.</p>
        <SettingsMessage>{error}</SettingsMessage>
        <SettingsButton type="submit" busy={busy} disabled={!name.trim()}>{offer.button}</SettingsButton>
      </form>
    </SettingsPage>
  );
}
