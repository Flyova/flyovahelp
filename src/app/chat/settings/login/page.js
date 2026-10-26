"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/authFetch";
import { useChat } from "@/components/chat/ChatProvider";
import { SettingsButton, SettingsInput, SettingsIntro, SettingsMessage, SettingsPage } from "@/components/chat/SettingsList";

/** Log in to another player's username with its password, to chat as it from this account. */
export default function UsernameLoginPage() {
  const router = useRouter();
  const { refreshIdentities, flashNotice } = useChat();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const logIn = async (e) => {
    e.preventDefault();
    const name = username.trim().replace(/^@/, "");
    if (!name || !password || busy) return;
    setBusy(true);
    setError("");
    const r = await authFetch("/api/chat/accounts", { method: "POST", body: { action: "login", username: name, password } }).catch((x) => ({ error: x.message }));
    setBusy(false);
    if (r.error) return setError(r.error);
    await refreshIdentities();
    flashNotice(`You're now logged in to @${r.username || name}.`);
    router.replace("/chat/settings/accounts");
  };

  return (
    <SettingsPage title="Log in to a username">
      <SettingsIntro>
        Have another player&apos;s username and its password? Log in to chat as it from this account, until you log out or its owner logs you out.
      </SettingsIntro>
      <form onSubmit={logIn} className="px-4 pb-5 pt-1 space-y-3">
        <SettingsInput label="Username" prefix="@" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" autoComplete="off" autoCapitalize="none" spellCheck={false} />
        <SettingsInput label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="its password" autoComplete="off" />
        <SettingsMessage>{error}</SettingsMessage>
        <SettingsButton type="submit" busy={busy} disabled={!username.trim() || !password}>Log in</SettingsButton>
      </form>
    </SettingsPage>
  );
}
