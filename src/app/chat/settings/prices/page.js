"use client";
import { TriangleAlert } from "lucide-react";
import { FREE_USERNAMES_AGENT, FREE_USERNAMES_OLD_ACCOUNT, OLD_ACCOUNT_MONTHS, USERNAME_PRICE } from "@/lib/chat";
import { SettingsPage } from "@/components/chat/SettingsList";

const RULES = [
  "You can create or change a username on your account only once for free.",
  `Any other username on your account costs $${USERNAME_PRICE}, paid from your wallet.`,
  `Accounts older than ${OLD_ACCOUNT_MONTHS} months can create up to ${FREE_USERNAMES_OLD_ACCOUNT} usernames for free.`,
  `Agents can create up to ${FREE_USERNAMES_AGENT} usernames for free.`,
  "A username belongs to the account that created it. To chat as another account's username, log in to it with its password in Chat settings.",
];

/** What chat usernames cost and the limits, shown from "Prices and limits". */
export default function UsernamePricesPage() {
  return (
    <SettingsPage title="Prices and limits" back="/chat/settings/add-username">
      <div className="p-4">
        <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl">
          <p className="flex items-center gap-2 text-[12px] font-black uppercase italic text-amber-500 mb-3">
            <TriangleAlert size={15} className="shrink-0" /> Buying chat usernames
          </p>
          <ul className="list-disc pl-4 space-y-2 text-[13px] font-semibold leading-relaxed text-white/75 marker:text-amber-500/70">
            {RULES.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
      </div>
    </SettingsPage>
  );
}
