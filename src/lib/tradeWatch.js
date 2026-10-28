import { FV, WITHDRAWAL_CONFIRM_MS, formatUsd } from "@/lib/money";
import { flagAccount, notifyUser } from "@/lib/notifications";

const ms = (ts) => ts?.toMillis?.() || Number(ts || 0);

/**
 * Flags players who haven't confirmed an agent withdrawal WITHDRAWAL_CONFIRM_MS after
 * the agent said they paid (markPaid), and alerts the admins; once per trade
 * (trades/{id}.overdueFlaggedAt). Checks every open trade, or just `docs`.
 * Returns how many it flagged.
 */
export async function flagOverdueWithdrawals(db, docs) {
  const open = docs || (await db.collection("trades").where("status", "==", "acknowledged").get()).docs;
  let flagged = 0;
  for (const doc of open) {
    const t = doc.data();
    if (t.type !== "withdrawal" || !t.agentPaidAt || t.overdueFlaggedAt || Date.now() - ms(t.agentPaidAt) < WITHDRAWAL_CONFIRM_MS) continue;
    // Claim the trade first so a second run can't flag it again.
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(doc.ref);
      if (snap.data()?.status !== "acknowledged" || snap.data()?.overdueFlaggedAt) return false;
      tx.update(doc.ref, { overdueFlaggedAt: FV().serverTimestamp() });
      return true;
    });
    if (!claimed) continue;
    flagged += 1;
    const minutes = WITHDRAWAL_CONFIRM_MS / 60000;
    await Promise.all([
      flagAccount(db, t.senderId, {
        reason: "withdrawal_unconfirmed",
        title: "Agent withdrawal not confirmed",
        body: `${t.senderName || "A player"} hasn't confirmed a ${formatUsd(t.amount)} withdrawal ${minutes} minutes after ${t.agentName || "the agent"} said they paid (trade ${doc.id}).`,
      }),
      notifyUser(db, t.senderId, {
        type: "warning", title: "Please confirm your withdrawal",
        body: `${t.agentName || "Your agent"} says they paid you ${formatUsd(t.amount)} over ${minutes} minutes ago. Confirm it on the trade page, or tell support if it hasn't arrived.`,
        url: `/trade/${doc.id}`,
      }),
    ]);
  }
  return flagged;
}
