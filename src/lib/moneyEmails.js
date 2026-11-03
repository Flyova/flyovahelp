// Emails the money routes send (they used to be built and sent from players' browsers
// through /api/send-email). Names and addresses players typed are escaped. Each one to
// a player is of a kind they can switch off (lib/emailPrefs); admin emails always go.
import { sendEmail } from "@/lib/resend";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ADMIN_NOTIFY_EMAIL, USDT_NETWORK, formatUsd } from "@/lib/money";
import { emailKindOn } from "@/lib/emailPrefs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const card = (title, color, body, footer) => `
  <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; border: 1px solid #ddd; border-radius: 8px;">
    <h2 style="color: ${color}; border-bottom: 1px solid #eee; padding-bottom: 10px;">${title}</h2>
    ${body}
    <div style="margin-top: 30px; font-size: 11px; color: #777; border-top: 1px solid #eee; padding-top: 15px;">${footer}</div>
  </div>`;
const box = (rows) => `
    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #eee;">
      ${rows.map(([k, v]) => `<p style="margin: 5px 0;"><strong>${k}:</strong> ${v}</p>`).join("")}
    </div>`;

/**
 * Whether the player `uid` gets `kind` emails (users/{uid}.emailPrefs). If their
 * account can't be read, they do: a lost email is worse than an unwanted one.
 */
export async function wantsEmail(uid, kind) {
  if (!uid || !kind) return true;
  try {
    const snap = await getAdminDb().collection("users").doc(uid).get();
    return emailKindOn(snap.exists ? snap.data().emailPrefs : null, kind);
  } catch (e) {
    console.error("Email preference check failed:", e?.message || e);
    return true;
  }
}

/**
 * Sends without ever failing the money movement that triggered it. With `uid` and
 * `kind`, only if that player hasn't switched that kind of email off.
 */
export async function notify(to, subject, html, { uid, kind } = {}) {
  if (!to) return;
  if (!(await wantsEmail(uid, kind))) return;
  const res = await sendEmail(to, subject, html).catch((e) => ({ success: false, error: e }));
  if (!res?.success) console.error(`Email "${subject}" failed:`, res?.error?.message || res?.error);
}

export const transferReceivedEmail = ({ to, uid, name, senderName, amount, txId }) => notify(to, "Funds Received - P2P Transfer", card(
  "Payment Received", "#2457D6",
  `<p>Hello ${esc(name)},</p>
    <p>You have received a P2P transfer from another user on the StraWins Network.</p>
    ${box([["Sender", esc(senderName)], ["Amount", formatUsd(amount)], ["Transaction ID", esc(txId)]])}
    <p>The funds are now available in your StraWins wallet for immediate use or withdrawal.</p>`,
  "StraWins Global Liquidity Control",
), { uid, kind: "transfers" });

export const usdtWithdrawalEmails = ({ email, name, uid, amount, fee, bonus, total, address }) => Promise.all([
  notify(ADMIN_NOTIFY_EMAIL, "New USDT Withdrawal Request", card(
    "Withdrawal Alert", "#8B1E3F",
    `${box([["User", `${esc(name)} (${esc(uid)})`], ["Amount", formatUsd(amount)], ["Network Fee", formatUsd(fee)], ["Address", `<code>${esc(address)}</code>`]])}
      <p style="font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 1px;">Action required in Admin Panel</p>`,
    "StraWins",
  )),
  notify(email, "Withdrawal Request Received", card(
    "Withdrawal Request Received", "#8B1E3F",
    `<p>Hi ${esc(name)}, your USDT withdrawal request has been submitted and is now being reviewed.</p>
      ${box([
        ["Withdrawal Amount", formatUsd(amount)],
        ["Service Fee", formatUsd(fee)],
        ...(bonus > 0 ? [["Bonus Recovery", formatUsd(bonus)]] : []),
        ["Total Deducted", formatUsd(total)],
        ["Network", `${USDT_NETWORK} (USDT)`],
        ["Destination", esc(address)],
      ])}
      <p>Our team typically processes USDT withdrawals within <strong>24 hours</strong>. You will receive another email once your withdrawal has been approved or declined.</p>
      <p style="color: #999; font-size: 11px;">If you did not request this withdrawal, please contact support immediately.</p>`,
    "StraWins Gaming Platform",
  ), { uid, kind: "funds" }),
]);

/** To the agent (`uid`) a player picked. */
export const tradeAssignedEmail = ({ to, uid, agentName, type, senderName, amount, tradeId }) => notify(
  to,
  type === "deposit" ? "New Deposit Assignment Received" : "New Withdrawal Assignment Received",
  card(
    type === "deposit" ? "New Deposit Request" : "New Payout Request", "#000",
    `<p>Hello ${esc(agentName)},</p>
      <p>${type === "deposit" ? "A user has initiated a deposit request to your account." : "A user has initiated a withdrawal through your agency."}</p>
      ${box([[type === "deposit" ? "User" : "Sender", esc(senderName)], [type === "deposit" ? "Proposed Amount" : "Amount", formatUsd(amount)], ["Trade ID", esc(tradeId)]])}
      <p>${type === "deposit"
        ? "Please log in to your agent panel to confirm the transaction once funds are received."
        : "Please log in to your agent panel to view the user's bank details and complete the transfer."}</p>`,
    "StraWins Agent Network",
  ),
  { uid, kind: "trades" },
);

export const tradeAcceptedEmail = ({ to, uid, type, amount, tradeId }) => notify(to, "Trade Request Accepted", card(
  "Agent Accepted Trade", "#2457D6",
  `<p>Hello,</p>
    <p><strong>Trade ID:</strong> ${esc(tradeId)}</p>
    <p>The agent has accepted your ${type} request for ${formatUsd(amount)}.</p>
    <p>${type === "deposit"
      ? "Please return to the Trade Room to view the agent's bank details and make your payment."
      : "The agent is now processing your payout. Please check the trade chat for payment confirmation."}</p>`,
  "StraWins Global Network",
), { uid, kind: "trades" });

export const tradeDeclinedEmail = ({ to, uid, type, amount }) => notify(to, "Trade Request Declined", card(
  "Request Declined", "#e11d48",
  `<p>Hello,</p>
    <p>Your ${type} request for ${formatUsd(amount)} has been declined by the agent.</p>
    <p>${type === "withdrawal"
      ? "The original trade amount has been refunded to your wallet balance."
      : "This transaction has been cancelled. No funds were charged."}</p>`,
  "StraWins Global Network",
), { uid, kind: "trades" });

export const tradeCompletedEmail = ({ to, uid, type, amount }) => notify(to, "Trade Successfully Completed", card(
  "Transaction Success", "#10b981",
  `<p>Hello,</p>
    <p>Your ${type} of ${formatUsd(amount)} has been successfully verified and completed.</p>
    <p>${type === "deposit"
      ? "The funds have been credited to your StraWins wallet."
      : "The funds have been sent to your provided account details."}</p>`,
  "StraWins Global Network",
), { uid, kind: "trades" });

export const predictPlanEmail = ({ to, uid, name, plan, price, expires }) => notify(to, "Predict & Win Plan Activated", card(
  "Access Granted", "#2457D6",
  `<p>Hello ${esc(name || "User")},</p>
    <p>Your stake for the <strong>${esc(plan)}</strong> Predict & Win plan was successful.</p>
    ${box([["Plan Type", esc(plan)], ["Stake Amount", formatUsd(price)], ["Expires", esc(new Date(expires).toUTCString())]])}
    <p>You can now place predictions and win rewards for every correct outcome during your session.</p>`,
  "StraWins Gaming & Rewards",
), { uid, kind: "games" });

/** `image` is a proof screenshot the route checked is on our Cloudinary account. */
export const depositProofEmail = ({ uid, amount, hash, image }) => notify(ADMIN_NOTIFY_EMAIL, "New Deposit Proof Submitted", card(
  "Deposit Verification Required", "#000",
  `${box([["User ID", esc(uid)], ["Amount", `${formatUsd(amount)} USDT`], ["Transaction Hash", `<code>${esc(hash)}</code>`]])}
    <p><strong>Proof Attachment:</strong></p>
    <a href="${esc(image)}" target="_blank"><img src="${esc(image)}" style="width: 100%; max-width: 400px; border: 1px solid #ccc; border-radius: 4px;" /></a>`,
  "This is a system notification for the StraWins Admin Panel.",
));
