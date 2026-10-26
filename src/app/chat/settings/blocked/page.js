"use client";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Ban } from "lucide-react";
import { db } from "@/lib/firebase";
import { useChat } from "@/components/chat/ChatProvider";
import Avatar from "@/components/Avatar";
import { SettingsIntro, SettingsPage, SettingsRow, SettingsSection } from "@/components/chat/SettingsList";

/** Players this chat profile has blocked, with Unblock. */
export default function BlockedPage() {
  const { settingsName: name, unblockUser, openProfile } = useChat();
  const [blocked, setBlocked] = useState(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!name) return;
    return onSnapshot(
      query(collection(db, "chat_blocks"), where("blocker", "==", name)),
      (s) => setBlocked(s.docs.map((d) => d.data().blocked).sort()),
      () => setBlocked([])
    );
  }, [name]);

  const unblock = async (target) => {
    setBusy(target);
    await unblockUser(target, name);
    setBusy("");
  };

  return (
    <SettingsPage title="Blocked">
      <SettingsIntro>
        Players @{name} has blocked can&apos;t message it or send it coins, and their Chatroom messages are hidden. They aren&apos;t told.
      </SettingsIntro>
      <SettingsSection>
        {blocked === null && <p className="px-4 py-6 text-center text-sm text-white/45">Loading…</p>}
        {blocked?.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <span className="w-12 h-12 rounded-full bg-white/[0.06] flex items-center justify-center text-white/50"><Ban size={22} /></span>
            <p className="text-[15px] font-semibold">No one blocked</p>
            <p className="text-[13px] text-white/50">Block a player from their profile or a message&apos;s menu.</p>
          </div>
        )}
        {blocked?.map((b) => (
          <SettingsRow
            key={b}
            icon={<button type="button" onClick={() => openProfile(b)} aria-label={`View @${b}'s profile`}><Avatar username={b} size={36} rounded="rounded-full" /></button>}
            title={`@${b}`}
            trailing={(
              <button
                type="button"
                disabled={busy === b}
                onClick={() => unblock(b)}
                className="shrink-0 h-8 px-3.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] text-[13px] font-bold disabled:opacity-50"
              >
                {busy === b ? "…" : "Unblock"}
              </button>
            )}
          />
        ))}
      </SettingsSection>
    </SettingsPage>
  );
}
