import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { resolvePrivilegedRole } from "@/lib/adminAccess";
import {
  AGENT_FEE_RATE, BONUS_REPAYMENT, FV, MIN_AGENT_TRADE, REFERRAL_COMMISSION, TRADE_EXPIRY_MS, UNPAID_DEPOSIT_MS,
  WITHDRAWAL_CONFIRM_MS, bankOf, cents, cleanRateTiers, depositLockError, formatUsd, isBanned, isTradingAgent,
  isValidAccountName, owesBonus, parseAmount, rateFor, referrerOf, systemSettings, toDollars,
} from "@/lib/money";
import { tradeAcceptedEmail, tradeAssignedEmail, tradeCompletedEmail, tradeDeclinedEmail } from "@/lib/moneyEmails";
import { creditInflowSafely } from "@/lib/inflowBonus";
import { checkTxPin } from "@/lib/txPin";
import { recordInvalidDeposit } from "@/lib/depositLock";
import { alertAdmins, notifyUser } from "@/lib/notifications";

// Trades with local agents: a player deposits or withdraws by paying (or being paid
// by) an agent outside the app, and balances move here. Players' and agents' apps
// can't change trades, wallets or agent balances (Firestore rules); the trade chat
// (trades/{id}/messages) is still written directly.
//
//   deposit:    player creates -> agent accepts (agent balance pays amount + 3%) ->
//               player pays the agent and says so (markPaid) -> agent confirms (player's
//               wallet gets the amount).
//               Unpaid UNPAID_DEPOSIT_MS after accepting, the agent can call it unpaid
//               (notPaid): their balance comes back and it counts toward the player's
//               unpaid-deposit lock (lib/depositLock).
//   withdrawal: player creates (wallet pays amount + any $3 bonus repayment) -> agent
//               accepts -> agent pays the player and says so (markPaid) -> player confirms
//               (agent balance gets amount − 5%). Not confirmed WITHDRAWAL_CONFIRM_MS after
//               markPaid, the player is flagged for the admins (/api/cron/watch).
//               Declined or expired: the amount goes back.
//   A player needs a bank account (users/{uid}.bank, /api/wallet bankSet) to trade; it's
//   copied onto the trade as senderBank for the agent. A withdrawal also needs their PIN.
//   Admins are alerted when a trade starts, completes or goes wrong.
//
//   GET ?view=agents&type=deposit|withdrawal&amount= -> { agents: [{ id, full_name, deposit_rate, withdrawal_rate,
//        deposit_tiers, withdrawal_tiers, rate }] } approved agents in your country (for a deposit, ones whose
//        balance covers amount + fee); `rate` is the one this amount gets (lib/money rateFor)
//   GET ?view=agent&id=   -> { name, country, bank? }   a trade's agent; the bank details only for the
//        depositor, once the agent has accepted (agents' records aren't readable by players)
//   POST { action: "create", type, agentId, amount, txPin? } -> { id, balance? }   txPin for a withdrawal
//   POST { action: "accept" | "decline" | "confirm" | "expire" | "markPaid" | "notPaid", id } -> { ok }
//        markPaid: whoever sends the money says they have (the player on a deposit, the agent on
//        a withdrawal); Confirm is refused until then. A trade keeps the agent's `country`
//        for showing its local-currency total.
//   POST { action: "agentTopup" | "agentWithdraw", amount } -> { wallet, agentBalance }
//                                                    an agent moving money between their two balances
//   POST { action: "staffCancel" | "staffRefund", id } -> { ok, refunded? }   admin/staff/support (Agent TX page):
//                                                    a refund returns a deposit's locked amount + fee to the
//                                                    agent, or a withdrawal's amount to the player, once

const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const TYPES = ["deposit", "withdrawal"];
const createdMs = (t) => t.createdAt?.toMillis?.() || Number(t.createdAt || 0);
const isExpired = (t) => createdMs(t) > 0 && Date.now() - createdMs(t) >= TRADE_EXPIRY_MS;

/** The trade's entry in the player's history (written when a withdrawal is created), if any. */
const historyEntry = (db, t, id) =>
  db.collection("users").doc(t.senderId).collection("transactions").where("tradeId", "==", id).limit(1);

async function create(db, caller, { type, agentId, amount, txPin }) {
  if (!TYPES.includes(type)) return fail("Choose deposit or withdrawal.");
  const value = parseAmount(amount, { min: MIN_AGENT_TRADE });
  if (value === null) return fail(`Minimum ${type} is ${formatUsd(MIN_AGENT_TRADE)}.`);
  if (!agentId || typeof agentId !== "string" || agentId === caller.uid) return fail("Please select an agent.");
  const settings = await systemSettings(db);
  if (settings[type === "deposit" ? "depositEnabled" : "withdrawalEnabled"] === false) {
    return fail(`${type === "deposit" ? "Deposits" : "Withdrawals"} are paused right now. Please try again later.`, 403);
  }
  if (type === "withdrawal") {
    const badPin = await checkTxPin(db, caller.uid, txPin);
    if (badPin) return fail(badPin.error, badPin.status);
  }
  const userRef = db.collection("users").doc(caller.uid);
  const agentRef = db.collection("agents").doc(agentId);
  const tradeRef = db.collection("trades").doc();
  const open = db.collection("trades").where("senderId", "==", caller.uid).where("status", "==", "pending").limit(1);

  const out = await db.runTransaction(async (tx) => {
    const [u, a] = await tx.getAll(userRef, agentRef);
    const pending = await tx.get(open);
    if (!u.exists) return { error: "Account not found.", status: 404 };
    if (!isTradingAgent(a.exists && a.data())) return { error: "This agent isn't available. Please choose another.", status: 409 };
    if (!pending.empty) return { error: "You already have an active pending trade.", status: 409 };
    const me = u.data();
    const agent = a.data();
    if (isBanned(me)) return { error: "Your account can't trade.", status: 403 };
    if (type === "deposit" && me.restrictDeposit) return { error: "Deposits have been restricted on your account. Please contact support.", status: 403 };
    if (type === "withdrawal" && me.restrictWithdrawal) return { error: "Withdrawals have been restricted on your account. Please contact support.", status: 403 };
    if (type === "deposit" && depositLockError(me)) return { error: depositLockError(me), status: 423 };
    const bank = bankOf(me);
    if (!bank) return { error: "Add your bank account in Settings before trading with an agent. It must be in your account's name.", status: 428 };
    const now = FV().serverTimestamp();
    const trade = {
      // The agent's buy rate for a deposit, sell rate for a withdrawal (local currency per $), for this amount.
      senderId: caller.uid, agentId, amount: value, rate: rateFor(agent, type, value),
      type, status: "pending",
      createdAt: now, senderName: me.fullName || "User", agentName: agent.full_name || "Agent", country: agent.country || me.country || "",
      senderBank: { bankName: bank.bankName || "", accountNumber: bank.accountNumber || "", accountName: bank.accountName || "" },
    };
    if (type === "deposit") {
      tx.set(tradeRef, trade);
      return { me, agent };
    }
    if (!isValidAccountName(me.fullName)) {
      return { error: "Your account name is incomplete or invalid for withdrawals. It needs a full first and last name (e.g. John Doe); single names or initials aren't accepted. Contact support to update it.", status: 403 };
    }
    const bonus = owesBonus(me) ? BONUS_REPAYMENT : 0;
    const totalC = cents(value) + cents(bonus);
    if (cents(me.wallet) < totalC) {
      return { error: `Insufficient balance. You need ${formatUsd(toDollars(totalC))} total (including bonus recovery).`, status: 402 };
    }
    tx.update(userRef, {
      wallet: FV().increment(-toDollars(totalC)),
      ...(bonus ? { bonusDeducted: true, welcomeBonusStatus: "recovered", welcomeBonusRecoveredAt: now } : {}),
    });
    if (bonus) {
      tx.set(userRef.collection("transactions").doc(), {
        title: "Bonus Recovery", amount: -bonus, type: "adjustment", status: "completed", timestamp: now, details: "Signup bonus recovery",
      });
    }
    tx.set(tradeRef, { ...trade, fee: 0, bonusRecovered: bonus });
    tx.set(userRef.collection("transactions").doc(), {
      amount: -value, fee: 0, bonusRecovered: bonus, type: "withdrawal", method: "agent", agentName: agent.full_name || "",
      tradeId: tradeRef.id, status: "pending", timestamp: now,
    });
    return { me, agent, balance: toDollars(cents(me.wallet) - totalC) };
  });
  if (out.error) return fail(out.error, out.status);
  const url = `/trade/${tradeRef.id}`;
  await Promise.all([
    tradeAssignedEmail({ to: out.agent.email, agentName: out.agent.full_name, type, senderName: out.me.fullName, amount: value, tradeId: tradeRef.id }),
    notifyUser(db, agentId, { type: "merchant", title: `New ${type} request`, body: `${out.me.fullName || "A player"} wants to ${type === "deposit" ? "deposit" : "withdraw"} ${formatUsd(value)} with you. Accept it within 15 minutes.`, url }),
    alertAdmins(db, { type: "trade", title: `Agent ${type} started`, body: `${out.me.fullName || "A player"} → ${out.agent.full_name || "agent"}: ${formatUsd(value)}.`, uid: caller.uid, url: "/admin/agent-tx" }),
  ]);
  return NextResponse.json({ id: tradeRef.id, ...(out.balance !== undefined ? { balance: out.balance } : {}) });
}

/** Runs `step(tx, trade, refs)` on a live trade; `step` returns an error object or nothing. */
async function onTrade(db, id, step) {
  if (!id || typeof id !== "string") return { error: "Trade not found.", status: 404 };
  const tradeRef = db.collection("trades").doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(tradeRef);
    if (!snap.exists) return { error: "Trade not found.", status: 404 };
    const trade = snap.data();
    return (await step(tx, trade, tradeRef)) || { trade };
  });
}

async function accept(db, caller, { id }) {
  const agentRef = db.collection("agents").doc(caller.uid);
  const out = await onTrade(db, id, async (tx, t, tradeRef) => {
    if (t.agentId !== caller.uid) return { error: "Only this trade's agent can accept it.", status: 403 };
    if (t.status !== "pending" || t.refunded) return { error: "This trade is no longer pending.", status: 409 };
    if (isExpired(t)) return { error: "This trade has expired.", status: 409 };
    const a = await tx.get(agentRef);
    if (!isTradingAgent(a.exists && a.data())) return { error: "Your agent account can't take trades.", status: 403 };
    const amount = Number(t.amount);
    const feeC = Math.round(cents(amount) * AGENT_FEE_RATE[t.type]);
    const totalC = cents(amount) + feeC;
    if (t.type === "deposit") {
      if (cents(a.data().agent_balance) < totalC) {
        return { error: `Insufficient Agent Balance! Need ${formatUsd(toDollars(totalC))}.`, status: 402 };
      }
      tx.update(agentRef, { agent_balance: FV().increment(-toDollars(totalC)) });
    }
    tx.update(tradeRef, {
      status: "acknowledged", acceptedAt: FV().serverTimestamp(), fee: toDollars(feeC), feeCharged: toDollars(feeC),
      agentImpact: t.type === "deposit" ? -toDollars(totalC) : 0,
    });
  });
  if (out.error) return fail(out.error, out.status);
  const sender = (await db.collection("users").doc(out.trade.senderId).get()).data();
  await Promise.all([
    tradeAcceptedEmail({ to: sender?.email, type: out.trade.type, amount: out.trade.amount, tradeId: id }),
    notifyUser(db, out.trade.senderId, {
      type: "merchant", title: `${out.trade.agentName || "Your agent"} accepted your ${out.trade.type}`,
      body: out.trade.type === "deposit"
        ? `Pay ${formatUsd(out.trade.amount)} at their rate now, then wait for them to confirm. Unpaid requests can lock deposits.`
        : `They'll send you ${formatUsd(out.trade.amount)}. Confirm on the trade page as soon as it arrives.`,
      url: `/trade/${id}`,
    }),
  ]);
  return NextResponse.json({ ok: true });
}

/** Withdrawal declined or expired: the amount (not any bonus repayment) goes back to the player. */
async function refundWithdrawal(tx, db, t, id, description) {
  const entry = await tx.get(historyEntry(db, t, id));
  const amount = Number(t.amount || 0);
  if (amount > 0) tx.update(db.collection("users").doc(t.senderId), { wallet: FV().increment(amount) });
  if (!entry.empty) tx.update(entry.docs[0].ref, { status: "cancelled", description });
  return amount;
}

async function decline(db, caller, { id }) {
  const out = await onTrade(db, id, async (tx, t, tradeRef) => {
    if (t.agentId !== caller.uid) return { error: "Only this trade's agent can decline it.", status: 403 };
    if (t.status !== "pending" || t.refunded) return { error: "This trade is no longer pending.", status: 409 };
    const update = { status: "cancelled", cancelledAt: FV().serverTimestamp(), declineReason: "Agent Declined" };
    if (t.type === "withdrawal") {
      const refunded = await refundWithdrawal(tx, db, t, id, "Withdrawal Declined - Trade Amount Refunded");
      if (refunded > 0) Object.assign(update, { refunded: true, refundedAt: FV().serverTimestamp(), refundTarget: "client", refundAmount: refunded });
    }
    tx.update(tradeRef, update);
  });
  if (out.error) return fail(out.error, out.status);
  const sender = (await db.collection("users").doc(out.trade.senderId).get()).data();
  await Promise.all([
    tradeDeclinedEmail({ to: sender?.email, type: out.trade.type, amount: out.trade.amount }),
    notifyUser(db, out.trade.senderId, {
      type: "merchant", title: `${out.trade.agentName || "The agent"} declined your ${out.trade.type}`,
      body: out.trade.type === "withdrawal" ? `${formatUsd(out.trade.amount)} is back in your wallet. Try another agent.` : "Try another agent.",
      url: `/trade/${id}`,
    }),
    alertAdmins(db, { type: "trade", title: `Agent declined a ${out.trade.type}`, body: `${out.trade.agentName || "Agent"} declined ${out.trade.senderName || "a player"}'s ${formatUsd(out.trade.amount)}.`, uid: out.trade.senderId, url: "/admin/agent-tx" }),
  ]);
  return NextResponse.json({ ok: true });
}

async function expire(db, caller, { id }) {
  const out = await onTrade(db, id, async (tx, t, tradeRef) => {
    if (t.senderId !== caller.uid && t.agentId !== caller.uid) return { error: "Trade not found.", status: 404 };
    if (t.status !== "pending" || t.refunded) return { error: "This trade is no longer pending.", status: 409 };
    if (!isExpired(t)) return { error: "This trade hasn't expired yet.", status: 409 };
    const update = { status: "cancelled", reason: "Expired", declineReason: "Trade Timed Out", cancelledAt: FV().serverTimestamp() };
    if (t.type === "withdrawal") {
      const refunded = await refundWithdrawal(tx, db, t, id, "Trade Expired - Trade Amount Refunded Automatically");
      if (refunded > 0) Object.assign(update, { refunded: true, refundedAt: FV().serverTimestamp(), autoRefunded: true, refundTarget: "client", refundAmount: refunded });
    }
    tx.update(tradeRef, update);
  });
  if (out.error) return fail(out.error, out.status);
  return NextResponse.json({ ok: true });
}

async function confirm(db, caller, { id }) {
  // Deposits pay the depositor's referrer; resolved before the transaction (it may need queries).
  const first = id && typeof id === "string" ? await db.collection("trades").doc(id).get() : null;
  if (!first?.exists) return fail("Trade not found.", 404);
  const senderRef = db.collection("users").doc(first.data().senderId);
  const senderFirst = (await senderRef.get()).data() || {};
  const referrerId = first.data().type === "deposit" ? await referrerOf(db, senderRef.id, senderFirst) : null;

  const out = await onTrade(db, id, async (tx, t, tradeRef) => {
    const confirmer = t.type === "deposit" ? t.agentId : t.senderId;
    if (confirmer !== caller.uid) {
      return { error: t.type === "deposit" ? "Only the agent confirms a deposit." : "Only the player confirms a withdrawal.", status: 403 };
    }
    if (t.status !== "acknowledged" || t.refunded) return { error: "This trade can't be confirmed now.", status: 409 };
    if (!(t.type === "deposit" ? t.playerPaidAt : t.agentPaidAt)) {
      return {
        error: t.type === "deposit" ? "The player hasn't said they've sent the money yet." : "Your agent hasn't said they've sent the money yet.",
        status: 409,
      };
    }
    const amount = Number(t.amount);
    const feeC = Math.round(cents(amount) * AGENT_FEE_RATE[t.type]);
    const now = FV().serverTimestamp();
    if (t.type === "deposit") {
      const referrer = referrerId ? await tx.get(db.collection("users").doc(referrerId)) : null;
      tx.update(senderRef, { wallet: FV().increment(amount) });
      if (referrer?.exists) {
        const reward = toDollars(cents(amount) * REFERRAL_COMMISSION.agent);
        const referrerRef = db.collection("users").doc(referrerId);
        tx.update(referrerRef, { referralBonus: FV().increment(reward) });
        tx.set(referrerRef.collection("transactions").doc(), {
          amount: reward, type: "referral_reward", status: "completed",
          description: `${REFERRAL_COMMISSION.agent * 100}% commission from @${senderFirst.username || ""}'s deposit`,
          createdAt: now, fromUser: senderFirst.username || "", tradeId: id,
        });
      }
    } else {
      const entry = await tx.get(historyEntry(db, t, id));
      tx.update(db.collection("agents").doc(t.agentId), { agent_balance: FV().increment(toDollars(cents(amount) - feeC)) });
      if (!entry.empty) tx.update(entry.docs[0].ref, { status: "completed" });
    }
    const gone = FV().delete();
    tx.update(tradeRef, {
      status: "completed", completedAt: now, finalFee: toDollars(feeC),
      cancelledAt: gone, cancelledBy: gone, declineReason: gone, reason: gone, refunded: gone, refundedAt: gone, autoRefunded: gone,
    });
  });
  if (out.error) return fail(out.error, out.status);
  const t = out.trade;
  const sourceId = `trade_${id}`;
  const net = toDollars(cents(t.amount) - Math.round(cents(t.amount) * AGENT_FEE_RATE[t.type]));
  await Promise.all([
    tradeCompletedEmail({ to: senderFirst.email, type: t.type, amount: t.amount }),
    t.type === "deposit"
      ? notifyUser(db, t.senderId, { type: "success", title: "Deposit completed", body: `${formatUsd(t.amount)} from ${t.agentName || "your agent"} is in your wallet.`, url: `/trade/${id}` })
      : notifyUser(db, t.agentId, { type: "merchant", title: "Withdrawal confirmed", body: `${t.senderName || "The player"} confirmed your payment. ${formatUsd(net)} was added to your agent balance.`, url: `/trade/${id}` }),
    alertAdmins(db, { type: "trade", title: `Agent ${t.type} completed`, body: `${t.senderName || "A player"} ↔ ${t.agentName || "agent"}: ${formatUsd(t.amount)}.`, uid: t.senderId, url: "/admin/agent-tx" }),
    // Inflow bonus: the player's deposit or withdrawal, and the agent's deposit trade.
    creditInflowSafely(db, { uid: t.senderId, category: t.type, base: Number(t.amount), sourceId, note: `With agent ${t.agentName || ""}`.trim() }),
    t.type === "deposit" && creditInflowSafely(db, { uid: t.agentId, category: "agent_deposit", base: Number(t.amount), sourceId, note: `Deposit by ${t.senderName || "a player"}` }),
  ]);
  return NextResponse.json({ ok: true });
}

/**
 * The money has been sent: by the agent on a withdrawal (the player then has
 * WITHDRAWAL_CONFIRM_MS to confirm it), or by the player on a deposit.
 */
async function markPaid(db, caller, { id }) {
  const out = await onTrade(db, id, async (tx, t, tradeRef) => {
    const payer = t.type === "deposit" ? t.senderId : t.agentId;
    if (payer !== caller.uid) {
      return { error: t.type === "deposit" ? "Only the player pays a deposit." : "Only this trade's agent pays a withdrawal.", status: 403 };
    }
    if (t.status !== "acknowledged" || t.refunded) return { error: "Wait for the agent to accept this trade.", status: 409 };
    const field = t.type === "deposit" ? "playerPaidAt" : "agentPaidAt";
    if (t[field]) return { error: "You've already said this one is paid.", status: 409 };
    tx.update(tradeRef, { [field]: FV().serverTimestamp() });
  });
  if (out.error) return fail(out.error, out.status);
  const t = out.trade;
  await (t.type === "deposit"
    ? notifyUser(db, t.agentId, {
      type: "merchant", title: "The player says they've paid you",
      body: `${t.senderName || "The player"} sent their ${formatUsd(t.amount)} deposit. Check your bank and confirm it.`,
      url: `/trade/${id}`,
    })
    : notifyUser(db, t.senderId, {
      type: "merchant", title: "Your agent says they've paid you",
      body: `${t.agentName || "Your agent"} sent ${formatUsd(t.amount)}. Check your bank and confirm within ${WITHDRAWAL_CONFIRM_MS / 60000} minutes.`,
      url: `/trade/${id}`,
    }));
  return NextResponse.json({ ok: true });
}

/**
 * The player never paid an accepted deposit: the agent cancels it and gets back what
 * accepting took from their balance; it counts toward the player's unpaid-deposit lock.
 */
async function notPaid(db, caller, { id }) {
  const agentRef = db.collection("agents").doc(caller.uid);
  const out = await onTrade(db, id, async (tx, t, tradeRef) => {
    if (t.agentId !== caller.uid) return { error: "Only this trade's agent can do that.", status: 403 };
    if (t.type !== "deposit") return { error: "Only a deposit can be marked unpaid.", status: 409 };
    if (t.status !== "acknowledged" || t.refunded) return { error: "This trade can't be cancelled now.", status: 409 };
    const acceptedMs = t.acceptedAt?.toMillis?.() || 0;
    const wait = acceptedMs + UNPAID_DEPOSIT_MS - Date.now();
    if (wait > 0) return { error: `Give the player ${Math.ceil(wait / 60000)} more min to pay.`, status: 409 };
    const refundC = cents(t.amount) + cents(t.fee || t.feeCharged || 0);
    const now = FV().serverTimestamp();
    tx.update(agentRef, { agent_balance: FV().increment(toDollars(refundC)) });
    tx.update(tradeRef, {
      status: "cancelled", cancelledAt: now, cancelledBy: "agent", declineReason: "Player didn't pay",
      refunded: true, refundedAt: now, refundTarget: "agent", refundAmount: toDollars(refundC),
    });
  });
  if (out.error) return fail(out.error, out.status);
  const t = out.trade;
  await Promise.all([
    recordInvalidDeposit(db, t.senderId, { sourceId: `trade_${id}`, what: `a ${formatUsd(t.amount)} deposit with ${t.agentName || "an agent"} left unpaid` }),
    notifyUser(db, t.senderId, {
      type: "warning", title: "Deposit cancelled: not paid",
      body: `${t.agentName || "The agent"} didn't receive your ${formatUsd(t.amount)}. Unpaid requests can lock deposits for 48 hours.`,
      url: `/trade/${id}`,
    }),
    alertAdmins(db, {
      type: "trade", title: t.playerPaidAt ? "Disputed agent deposit" : "Agent deposit unpaid", uid: t.senderId, url: "/admin/agent-tx",
      body: `${t.agentName || "Agent"} says ${t.senderName || "a player"} didn't pay ${formatUsd(t.amount)}${t.playerPaidAt ? ", but the player said they had" : ""}.`,
      email: !!t.playerPaidAt,
    }),
  ]);
  return NextResponse.json({ ok: true });
}

/** An agent moving money between their main wallet and their agent balance. */
async function moveAgentBalance(db, caller, amount, toAgent) {
  const value = parseAmount(amount);
  if (value === null) return fail("Please enter a valid amount.");
  const userRef = db.collection("users").doc(caller.uid);
  const agentRef = db.collection("agents").doc(caller.uid);
  const out = await db.runTransaction(async (tx) => {
    const [u, a] = await tx.getAll(userRef, agentRef);
    if (!u.exists || !isTradingAgent(a.exists && a.data())) return { error: "Only approved agents have an agent balance.", status: 403 };
    if (isBanned(u.data())) return { error: "Your account can't move money.", status: 403 };
    const walletC = cents(u.data().wallet);
    const agentC = cents(a.data().agent_balance);
    const fromC = toAgent ? walletC : agentC;
    if (fromC < cents(value)) {
      return { error: `Insufficient funds in your ${toAgent ? "main wallet" : "agent balance"}. Available: ${formatUsd(toDollars(fromC))}.`, status: 402 };
    }
    const sign = toAgent ? 1 : -1;
    tx.update(userRef, { wallet: FV().increment(-sign * value) });
    tx.update(agentRef, { agent_balance: FV().increment(sign * value) });
    return { wallet: toDollars(walletC - sign * cents(value)), agentBalance: toDollars(agentC + sign * cents(value)) };
  });
  if (out.error) return fail(out.error, out.status);
  return NextResponse.json(out);
}

/** Admin, staff and support accounts (the Agent TX page). */
async function isStaffCaller(db, caller) {
  const me = (await db.collection("users").doc(caller.uid).get()).data();
  return !!resolvePrivilegedRole(me?.role, caller.email);
}

async function staffCancel(db, caller, { id }) {
  if (!(await isStaffCaller(db, caller))) return fail("Staff only.", 403);
  const out = await onTrade(db, id, async (tx, t, tradeRef) => {
    if (["completed", "cancelled", "refunded"].includes(t.status) || t.refunded) {
      return { error: "This trade can no longer be cancelled.", status: 409 };
    }
    tx.update(tradeRef, { status: "cancelled", cancelledAt: FV().serverTimestamp(), cancelledBy: "admin" });
  });
  if (out.error) return fail(out.error, out.status);
  return NextResponse.json({ ok: true });
}

async function staffRefund(db, caller, { id }) {
  if (!(await isStaffCaller(db, caller))) return fail("Staff only.", 403);
  const out = await onTrade(db, id, async (tx, t, tradeRef) => {
    if (t.refunded) return { error: "This trade has already been refunded.", status: 409 };
    if (t.status === "completed") return { error: "A completed trade can't be refunded.", status: 409 };
    const now = FV().serverTimestamp();
    let refundC;
    if (t.type === "deposit") {
      // The agent's balance is only charged (amount + fee) when they accept.
      if (!(Number(t.agentImpact) < 0) && !t.acceptedAt) return { error: "The agent's balance wasn't charged for this trade.", status: 409 };
      refundC = cents(t.amount) + cents(t.fee || t.feeCharged || t.finalFee || 0);
      const agentRef = db.collection("agents").doc(t.agentId);
      if (!(await tx.get(agentRef)).exists) return { error: "Agent profile not found. Cannot process deposit refund.", status: 404 };
      tx.update(agentRef, { agent_balance: FV().increment(toDollars(refundC)) });
    } else {
      const entry = await tx.get(historyEntry(db, t, id));
      refundC = cents(t.amount);
      tx.update(db.collection("users").doc(t.senderId), { wallet: FV().increment(toDollars(refundC)) });
      if (!entry.empty) tx.update(entry.docs[0].ref, { status: "refunded", description: "Admin Manual Refund Processed" });
    }
    tx.update(tradeRef, {
      refunded: true, refundedAt: now, refundTarget: t.type === "deposit" ? "agent" : "client", refundAmount: toDollars(refundC),
    });
    return { trade: t, refunded: toDollars(refundC) };
  });
  if (out.error) return fail(out.error, out.status);
  return NextResponse.json({ ok: true, refunded: out.refunded });
}

async function agentsView(db, caller, params) {
  const type = params.get("type") === "withdrawal" ? "withdrawal" : "deposit";
  const amount = Number(params.get("amount")) || 0;
  const me = (await db.collection("users").doc(caller.uid).get()).data();
  if (!me?.country) return NextResponse.json({ agents: [] });
  const snap = await db.collection("agents").where("application_status", "==", "approved")
    .where("country", "==", me.country).where("banned", "==", false).limit(30).get();
  const needC = type === "deposit" ? Math.round(cents(amount) * (1 + AGENT_FEE_RATE.deposit)) : 0;
  const agents = snap.docs
    .filter((d) => d.id !== caller.uid && cents(d.data().agent_balance) >= needC)
    .map((d) => {
      const a = d.data();
      const tiers = (key) => { const t = cleanRateTiers(a[key]); return t.error ? [] : t; };
      return {
        id: d.id,
        full_name: a.full_name || "Verified Agent",
        country: a.country || "",
        deposit_rate: Number(a.deposit_rate) || 0,
        withdrawal_rate: Number(a.withdrawal_rate) || 0,
        deposit_tiers: tiers("deposit_tiers"),
        withdrawal_tiers: tiers("withdrawal_tiers"),
        rate: rateFor(a, type, amount),
      };
    });
  return NextResponse.json({ agents });
}

async function agentView(db, caller, params) {
  const snap = await db.collection("trades").doc(String(params.get("id") || "")).get();
  const t = snap.exists ? snap.data() : null;
  if (!t || (t.senderId !== caller.uid && t.agentId !== caller.uid)) return fail("Trade not found.", 404);
  const a = (await db.collection("agents").doc(t.agentId).get()).data() || {};
  const showBank = t.senderId === caller.uid && t.type === "deposit" && ["acknowledged", "completed"].includes(t.status);
  return NextResponse.json({
    name: a.full_name || t.agentName || "Agent", country: t.country || a.country || "",
    ...(showBank ? { bank: { bankName: a.bankName || "", accountName: a.accountName || "", accountNumber: a.accountNumber || "" } } : {}),
  });
}

const VIEWS = { agents: agentsView, agent: agentView };

export async function GET(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const params = new URL(req.url).searchParams;
    const view = Object.hasOwn(VIEWS, params.get("view")) ? VIEWS[params.get("view")] : null;
    if (!view) return fail("Unknown view.");
    return await view(getAdminDb(), caller, params);
  } catch (e) {
    console.error("Trades view error:", e);
    return fail("Something went wrong. Please try again.", 500);
  }
}

const ACTIONS = {
  create, accept, decline, confirm, expire, markPaid, notPaid, staffCancel, staffRefund,
  agentTopup: (db, caller, body) => moveAgentBalance(db, caller, body.amount, true),
  agentWithdraw: (db, caller, body) => moveAgentBalance(db, caller, body.amount, false),
};

export async function POST(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const body = await req.json().catch(() => ({}));
    const run = Object.hasOwn(ACTIONS, body.action) ? ACTIONS[body.action] : null;
    if (!run) return fail("Unknown action.");
    return await run(getAdminDb(), caller, body);
  } catch (e) {
    console.error("Trades error:", e);
    return fail("Something went wrong. Please try again.", 500);
  }
}
