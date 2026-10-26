"use client";
import { FieldPath, collection, deleteField, getDocs, limit, query, updateDoc, where } from "firebase/firestore";
import { Coins, Eye, Globe2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { useChat } from "@/components/chat/ChatProvider";
import { SettingsLoading, SettingsPage, SettingsSection, SettingsSwitch, useSaveSetting } from "@/components/chat/SettingsList";

/** Takes `name`'s avatar off every chat where it shows how far it has read. */
async function clearReceipts(uid, name) {
  const snap = await getDocs(query(collection(db, "conversations"), where("participantUids", "array-contains", uid), limit(200)));
  await Promise.all(snap.docs
    .filter((d) => d.data().readAt?.[name])
    .map((d) => updateDoc(d.ref, new FieldPath("readAt", name), deleteField(), "presenceBy", name).catch(() => null)));
}

/** Read receipts, coins on show and hidden country, for one chat profile. */
export default function PrivacySettingsPage() {
  const { uid, settingsName: name, settingsFor, settingsLoaded } = useChat();
  const { busy, save } = useSaveSetting();
  const s = settingsFor(name);

  if (!settingsLoaded) return <SettingsPage title="Privacy"><SettingsLoading /></SettingsPage>;

  return (
    <SettingsPage title="Privacy">
      <SettingsSection title={`@${name}`}>
        <SettingsSwitch
          icon={Eye}
          title="Read receipts"
          text="Let people see your avatar under the messages you've read. Off: you won't see theirs either."
          on={s.readReceipts}
          disabled={busy === "receipts"}
          onChange={(v) => save("receipts", { readReceipts: v }, v ? null : () => clearReceipts(uid, name))}
        />
        <SettingsSwitch
          icon={Coins}
          title="Show off your coins"
          text="Show your coin balance on this profile for other players to see."
          on={s.showCoins}
          disabled={busy === "coins"}
          onChange={(v) => save("coins", { showCoins: v })}
        />
        <SettingsSwitch
          icon={Globe2}
          title="Hide country"
          text="Don't show your country on this profile or in player search."
          on={s.hideCountry}
          disabled={busy === "country"}
          onChange={(v) => save("country", { hideCountry: v })}
        />
      </SettingsSection>
    </SettingsPage>
  );
}
