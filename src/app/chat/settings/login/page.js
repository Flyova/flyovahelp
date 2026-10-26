"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/authFetch";
import { useChat } from "@/components/chat/ChatProvider";
import { SettingsButton, SettingsInput, SettingsIntro, SettingsMessage, SettingsPage } from "@/components/chat/SettingsList";

const accountsApi = (body) => authFetch("/api/chat/accounts", { method: "POST", body }).catch((e) => ({ error: e.message }));

/**
 * Log in to another player's username with its password, to chat as it from this
 * account. The first time, the username's owner is emailed a 6-digit code, and
 * the login finishes only once that code is entered here.
 */
export default function UsernameLoginPage() {
  const router = useRouter();
  const { refreshIdentities, flashNotice } = useChat();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState(""); // set once a code has been emailed
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const name = username.trim().replace(/^@/, "");

  const done = async (r) => {
    await refreshIdentities();
    flashNotice(`You're now logged in to @${r.username || name}.`);
    router.replace("/chat/settings/accounts");
  };

  const logIn = async (e) => {
    e?.preventDefault();
    if (!name || !password || busy) return;
    setBusy("login");
    setError("");
    setNote("");
    const r = await accountsApi({ action: "login", username: name, password });
    setBusy("");
    if (r.error) return setError(r.error);
    if (r.needsCode) {
      if (sentTo) setNote("A new code is on its way.");
      setSentTo(r.sentTo);
      return;
    }
    await done(r);
  };

  const confirm = async (e) => {
    e.preventDefault();
    if (code.length !== 6 || busy) return;
    setBusy("code");
    setError("");
    const r = await accountsApi({ action: "confirmLogin", username: name, code });
    setBusy("");
    if (r.error) return setError(r.error);
    await done(r);
  };

  if (sentTo) {
    return (
      <SettingsPage title="Enter the login code">
        <SettingsIntro>
          To keep usernames safe, the first login from a new account needs a code. We emailed a 6-digit code to the owner of @{name} ({sentTo}). Ask them for it, then
          enter it below. It expires in 10 minutes.
        </SettingsIntro>
        <form onSubmit={confirm} className="px-4 pb-5 pt-1 space-y-3">
          <SettingsInput
            label="Code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            autoFocus
          />
          <SettingsMessage>{error}</SettingsMessage>
          <SettingsMessage type="success">{note}</SettingsMessage>
          <SettingsButton type="submit" busy={busy === "code"} disabled={code.length !== 6}>Log in</SettingsButton>
          <SettingsButton tone="secondary" busy={busy === "login"} onClick={logIn}>Send a new code</SettingsButton>
          <button
            type="button"
            onClick={() => {
              setSentTo("");
              setCode("");
              setError("");
              setNote("");
            }}
            className="w-full text-center text-[13px] font-semibold text-white/55 hover:text-white py-2"
          >
            Use a different username
          </button>
        </form>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title="Log in to a username">
      <SettingsIntro>
        Have another player&apos;s username and its password? Log in to chat as it from this account, until you log out or its owner logs you out. The first time,
        its owner gets an email with a code you&apos;ll need.
      </SettingsIntro>
      <form onSubmit={logIn} className="px-4 pb-5 pt-1 space-y-3">
        <SettingsInput label="Username" prefix="@" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" autoComplete="off" autoCapitalize="none" spellCheck={false} />
        <SettingsInput label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="its password" autoComplete="off" />
        <SettingsMessage>{error}</SettingsMessage>
        <SettingsButton type="submit" busy={busy === "login"} disabled={!name || !password}>Continue</SettingsButton>
      </form>
    </SettingsPage>
  );
}
