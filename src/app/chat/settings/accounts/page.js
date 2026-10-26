"use client";
import { useEffect, useState } from "react";
import { Link2, LogIn, UserPlus } from "lucide-react";
import { authFetch } from "@/lib/authFetch";
import { accountLabels } from "@/lib/chat";
import { useChat } from "@/components/chat/ChatProvider";
import Avatar from "@/components/Avatar";
import { SettingsIntro, SettingsPage, SettingsRow, SettingsSection } from "@/components/chat/SettingsList";

/** Every chat profile on this account: tap one for its password, logging out or deleting it. */
export default function AccountsPage() {
  const { uid, identities, active } = useChat();
  const [auth, setAuth] = useState({});

  useEffect(() => {
    if (!uid) return;
    authFetch("/api/chat/accounts")
      .then((d) => setAuth(Object.fromEntries((d.items || []).map((x) => [x.username, x]))))
      .catch(() => {});
  }, [uid]);

  return (
    <SettingsPage title="Accounts">
      <SettingsIntro>Each username is its own chat profile, with its own chats, settings and password.</SettingsIntro>
      <SettingsSection title="Your chat profiles">
        {identities.map((i) => (
          <SettingsRow
            key={i.usernameLower}
            icon={<Avatar username={i.usernameLower} size={36} rounded="rounded-full" />}
            title={(
              <span className="flex items-center gap-1.5">
                @{i.username} {i.linked && <Link2 size={13} className="text-white/50" aria-label="logged in from another account" />}
              </span>
            )}
            text={accountLabels(i, auth[i.usernameLower], active)}
            href={`/chat/settings/accounts/${encodeURIComponent(i.usernameLower)}`}
          />
        ))}
      </SettingsSection>
      <SettingsSection>
        <SettingsRow icon={UserPlus} title="Add a username" href="/chat/settings/add-username" />
        <SettingsRow icon={LogIn} title="Log in to a username" href="/chat/settings/login" />
      </SettingsSection>
    </SettingsPage>
  );
}
