"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, LogOut, SlidersHorizontal, Trash2 } from "lucide-react";
import { authFetch } from "@/lib/authFetch";
import { accountLabels, norm } from "@/lib/chat";
import { useChat } from "@/components/chat/ChatProvider";
import Avatar from "@/components/Avatar";
import {
  SettingsButton, SettingsInput, SettingsIntro, SettingsMessage, SettingsPage, SettingsRow, SettingsSection,
} from "@/components/chat/SettingsList";

const accountsApi = (body) => authFetch("/api/chat/accounts", { method: "POST", body }).catch((e) => ({ error: e.message }));
const MIN = 6;

/**
 * One chat profile: use it, edit its settings, its password (anyone with the
 * username and password can log in to it from their own account), log other
 * accounts out of it, or delete it. A username you logged in to can be logged out of.
 */
export default function AccountPage() {
  const router = useRouter();
  const params = useParams();
  const name = norm(decodeURIComponent(String(params?.username || "")));
  const { uid, identities, active, selectIdentity, setSettingsName, refreshIdentities, flashNotice, confirmAction } = useChat();
  const identity = identities.find((i) => i.usernameLower === name);
  const [info, setInfo] = useState(null); // { hasPassword, otherAccounts }
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState({ type: "", msg: "" });

  const load = useCallback(() => authFetch("/api/chat/accounts")
    .then((d) => setInfo((d.items || []).find((x) => x.username === name) || { hasPassword: false, otherAccounts: 0 }))
    .catch(() => {}), [name]);
  useEffect(() => {
    if (uid) load();
  }, [uid, load]);

  const run = async (key, body, done) => {
    setBusy(key);
    setNote({ type: "", msg: "" });
    const r = await accountsApi(body);
    setBusy("");
    if (r.error) {
      setNote({ type: "error", msg: r.error });
      return false;
    }
    setNote({ type: "success", msg: done });
    await load();
    return true;
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (password.length < MIN) return setNote({ type: "error", msg: `Use at least ${MIN} characters.` });
    if (password !== repeat) return setNote({ type: "error", msg: "The two passwords don't match." });
    if (await run("save", { action: "setPassword", username: name, password }, info?.hasPassword ? "Password changed." : "Password set.")) {
      setPassword("");
      setRepeat("");
    }
  };

  const logOut = async () => {
    if (!(await confirmAction({ title: `Log out of @${name}?`, message: "You'll need its password to log in again.", confirmLabel: "Log out" }))) return;
    setBusy("logout");
    const r = await accountsApi({ action: "logout", username: name });
    setBusy("");
    if (r.error) return setNote({ type: "error", msg: r.error });
    if (name === active) selectIdentity(identities.find((i) => i.isDefault)?.usernameLower || "");
    await refreshIdentities();
    flashNotice(`You logged out of @${name}.`);
    router.replace("/chat/settings/accounts");
  };

  const remove = async () => {
    if (!(await confirmAction({ title: `Delete @${name}?`, message: `@${name} leaves all its groups. People you chatted with privately keep those chats but can't reply. Its coins move to your main username, and anyone can then take the name. This can't be undone.`, confirmLabel: "Delete" }))) return;
    setBusy("delete");
    const r = await authFetch("/api/chat/usernames", { method: "DELETE", body: { username: name } }).catch((e) => ({ error: e.message }));
    setBusy("");
    if (r.error) return setNote({ type: "error", msg: r.error });
    if (name === active) selectIdentity(identities.find((i) => i.isDefault)?.usernameLower || "");
    await refreshIdentities();
    flashNotice(`@${name} was deleted.`);
    router.replace("/chat/settings/accounts");
  };

  if (!identity) {
    return (
      <SettingsPage title="Account" back="/chat/settings/accounts">
        <p className="px-4 py-10 text-center text-sm text-white/50">{identities.length ? `@${name} isn't one of your chat profiles.` : "Loading…"}</p>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title={`@${identity.username}`} back="/chat/settings/accounts">
      <div className="flex flex-col items-center text-center px-4 pt-5 pb-4">
        <Avatar username={name} size={80} rounded="rounded-full" />
        <p className="mt-3 text-lg font-bold">@{identity.username}</p>
        <p className="text-[13px] text-white/50 mt-0.5">{accountLabels(identity, info, active)}</p>
      </div>

      <SettingsSection>
        {name === active ? (
          <SettingsRow icon={CheckCircle2} title="You're chatting as this username" text="New chats and Chatroom messages use it" />
        ) : (
          <SettingsRow icon={CheckCircle2} title="Chat as this username" text="Its own chats, groups, coins and settings" onClick={() => { selectIdentity(name); flashNotice(`You're now chatting as @${name}.`); }} />
        )}
        <SettingsRow icon={SlidersHorizontal} title="Settings for this profile" text="Notifications, online status, privacy, blocked" onClick={() => { setSettingsName(name); router.push("/chat/settings"); }} chevron />
      </SettingsSection>

      {identity.linked ? (
        <SettingsSection>
          <SettingsRow icon={LogOut} title={`Log out of @${name}`} text="It belongs to another account" danger onClick={logOut} disabled={busy === "logout"} />
        </SettingsSection>
      ) : (
        <SettingsSection title="Password">
          <SettingsIntro>
            Anyone with @{name} and its password can log in to it from their own StraWins account and chat as it, until they log out or you log them out.
            {info && ` ${info.otherAccounts ? `${info.otherAccounts} other account${info.otherAccounts === 1 ? " is" : "s are"} logged in now.` : "No other accounts are logged in."}`}
          </SettingsIntro>
          <form onSubmit={savePassword} className="px-4 pb-3 space-y-3">
            <SettingsInput label={info?.hasPassword ? "New password" : "Password"} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value.slice(0, 64))} />
            <SettingsInput label="Repeat password" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value.slice(0, 64))} />
            <SettingsMessage type={note.type}>{note.msg}</SettingsMessage>
            <SettingsButton type="submit" busy={busy === "save"} disabled={!password}>{info?.hasPassword ? "Change password" : "Set password"}</SettingsButton>
          </form>
          {info?.otherAccounts > 0 && (
            <SettingsRow
              icon={LogOut}
              title="Log out other accounts"
              value={info.otherAccounts}
              disabled={busy === "out"}
              onClick={async () => (await confirmAction({ title: `Log every other account out of @${name}?`, confirmLabel: "Log them out" })) && run("out", { action: "logoutOthers", username: name }, "Other accounts logged out.")}
            />
          )}
          {info?.hasPassword && (
            <SettingsRow
              icon={Trash2}
              title="Remove password"
              text="Logs every other account out, and no one else can log in"
              danger
              disabled={busy === "remove"}
              onClick={async () => (await confirmAction({ title: "Remove the password?", message: `Other accounts will be logged out of @${name} and can't log in again.`, confirmLabel: "Remove" })) && run("remove", { action: "removePassword", username: name }, "Password removed.")}
            />
          )}
        </SettingsSection>
      )}

      {!identity.isDefault && !identity.linked && (
        <SettingsSection>
          <SettingsRow icon={Trash2} title={`Delete @${name}`} text="Permanently removes this username" danger onClick={remove} disabled={busy === "delete"} />
        </SettingsSection>
      )}
    </SettingsPage>
  );
}
