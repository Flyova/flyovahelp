import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { resolvePrivilegedRole } from "@/lib/adminAccess";
import { AGENT_APPLICATION_FEE, FV, cents, cleanRateTiers, formatUsd, isBanned, toDollars } from "@/lib/money";
import { notify } from "@/lib/moneyEmails";
import { alertAdmins, notifyUser } from "@/lib/notifications";
import { agentBankMatches, sameAccountName } from "@/lib/agentBank";

// Becoming an agent, and an agent's rates and bank account. agents/{uid} is written only here (and by
// admins): an application costs AGENT_APPLICATION_FEE from the main wallet, which is
// refunded if it's declined.
//
//   POST { action: "apply", fullName, email, phone, country, age, passportPhoto, identityCard,
//          bankName?, accountName?, accountNumber? } -> { ok, balance }   the bank details are where players pay
//          the agent (changed later with "bank"); the account must be in fullName
//   POST { action: "decide", agentId, decision: "approved" | "rejected" } -> { ok }   admins; approving an
//        application from before the fee takes it then
//   POST { action: "rates", deposit_rate, withdrawal_rate, deposit_tiers?, withdrawal_tiers? } -> { ok }
//        the agent's buy and sell rates, plus rates from bigger amounts up (lib/money rateFor)
//   POST { action: "bank", bankName, accountName, accountNumber, phone? } -> { ok }   an approved agent's bank
//        account (Agent Profile); refused unless it's in their approved agent name, since an agent whose
//        account isn't can't trade (lib/agentBank)
//   POST { action: "adminEdit", agentId, fullName, email, phone, country, age, bankName, accountName, accountNumber,
//          deposit_rate, withdrawal_rate } -> { ok, bankMatches }   admins correcting an agent's details; the
//        account may be left out of the agent's name, and bankMatches says whether they can still take trades
//   POST { action: "adminDelete", agentId } -> { ok, returned, refunded }   admins removing an agent: refused while
//        a trade with them is open; their agent balance goes to their main wallet (returned), an unrefunded
//        application fee back too (refunded), and they can apply again

const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const PHOTO = /^https:\/\/res\.cloudinary\.com\/[\w-]+\/image\/upload\/[\w\-./%]+$/;
const REAPPLY_MS = 24 * 60 * 60 * 1000;
// Trades that still hold money or wait on the agent (/api/trades).
const OPEN_TRADE_STATUSES = ["pending", "acknowledged", "disputed"];
const text = (v, max = 80) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

async function isAdminCaller(db, caller) {
  const me = (await db.collection("users").doc(caller.uid).get()).data();
  return resolvePrivilegedRole(me?.role, caller.email) === "admin";
}

async function apply(db, caller, body) {
  const form = {
    full_name: text(body.fullName), email: text(body.email, 120).toLowerCase(), phone_number: text(body.phone, 30),
    country: text(body.country, 60), age: text(body.age, 3),
  };
  if (form.full_name.split(" ").length < 2) return fail("Enter your full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return fail("Enter a valid email.");
  if (!/^[+\d][\d\s()-]{5,}$/.test(form.phone_number)) return fail("Enter a valid phone number.");
  if (!form.country) return fail("Choose your country.");
  if (!(Number(form.age) >= 18 && Number(form.age) <= 120)) return fail("Agents must be 18 or older.");
  if (!PHOTO.test(String(body.passportPhoto || "")) || !PHOTO.test(String(body.identityCard || ""))) return fail("Please upload both photos.");
  const bank = { bankName: text(body.bankName, 60), accountName: text(body.accountName), accountNumber: String(body.accountNumber ?? "").replace(/[\s-]/g, "") };
  if (bank.accountNumber && !/^[0-9A-Za-z]{6,34}$/.test(bank.accountNumber)) return fail("Enter a valid account number.");
  if (bank.accountNumber && !sameAccountName(form.full_name, bank.accountName)) {
    return fail(`The bank account must be in the name you're applying with (${form.full_name}). Agents can only trade with an account in their own name.`);
  }

  const userRef = db.collection("users").doc(caller.uid);
  const agentRef = db.collection("agents").doc(caller.uid);
  const out = await db.runTransaction(async (tx) => {
    const [u, a] = await tx.getAll(userRef, agentRef);
    if (!u.exists) return { error: "Account not found.", status: 404 };
    const me = u.data();
    const old = a.exists ? a.data() : null;
    if (isBanned(me) || old?.banned) return { error: "Your account can't apply.", status: 403 };
    if (old?.application_status === "approved") return { error: "You're already an agent.", status: 409 };
    if (old?.application_status === "pending") return { error: "Your application is already being reviewed.", status: 409 };
    const rejectedMs = old?.rejected_at?.toMillis?.() || 0;
    if (rejectedMs && Date.now() - rejectedMs < REAPPLY_MS) return { error: "You can apply again 24 hours after a declined application.", status: 409 };
    const feeC = cents(AGENT_APPLICATION_FEE);
    if (cents(me.wallet) < feeC) {
      return { error: `Applying costs ${formatUsd(AGENT_APPLICATION_FEE)} from your wallet (refunded if you're not approved). You have ${formatUsd(me.wallet)}.`, status: 402 };
    }
    const now = FV().serverTimestamp();
    tx.update(userRef, { wallet: FV().increment(-AGENT_APPLICATION_FEE), hasApplied: true });
    tx.set(userRef.collection("transactions").doc(), {
      title: "Agent Application Fee", amount: -AGENT_APPLICATION_FEE, type: "agent_fee", status: "completed", timestamp: now,
      description: "Refunded if the application is declined",
    });
    tx.set(agentRef, {
      ...form, user_id: caller.uid, passport_photo: body.passportPhoto, identity_card: body.identityCard,
      ...(bank.bankName && bank.accountNumber ? bank : {}),
      application_status: "pending", applied_at: now, banned: false,
      deposit_rate: Number(old?.deposit_rate) || 0, withdrawal_rate: Number(old?.withdrawal_rate) || 0, exchange_rate: 0,
      agent_balance: Number(old?.agent_balance) || 0,
      applicationFee: AGENT_APPLICATION_FEE, applicationFeePaidAt: now, applicationFeeRefunded: false,
    });
    return { balance: toDollars(cents(me.wallet) - feeC) };
  });
  if (out.error) return fail(out.error, out.status);
  await alertAdmins(db, {
    type: "agent_application", title: "New agent application",
    body: `${form.full_name} (${form.country}) applied and paid the ${formatUsd(AGENT_APPLICATION_FEE)} fee.`,
    uid: caller.uid, url: "/admin/agents", email: true,
  });
  return NextResponse.json({ ok: true, balance: out.balance });
}

async function decide(db, caller, { agentId, decision }) {
  if (!(await isAdminCaller(db, caller))) return fail("Administrative access required.", 403);
  if (!["approved", "rejected"].includes(decision)) return fail("Approve or reject.");
  if (!agentId || typeof agentId !== "string") return fail("Agent not found.", 404);
  const userRef = db.collection("users").doc(agentId);
  const agentRef = db.collection("agents").doc(agentId);
  const out = await db.runTransaction(async (tx) => {
    const [u, a] = await tx.getAll(userRef, agentRef);
    if (!a.exists || !u.exists) return { error: "Application not found.", status: 404 };
    const app = a.data();
    const now = FV().serverTimestamp();
    const ledger = (title, amount) => tx.set(userRef.collection("transactions").doc(), {
      title, amount, type: "agent_fee", status: "completed", timestamp: now,
    });
    if (decision === "approved") {
      const feeDue = !app.applicationFeePaidAt || app.applicationFeeRefunded;
      if (feeDue) {
        // Applied before the fee, or it was refunded when declined earlier: it's taken on approval.
        if (cents(u.data().wallet) < cents(AGENT_APPLICATION_FEE)) {
          return { error: `This applicant hasn't paid the ${formatUsd(AGENT_APPLICATION_FEE)} fee and has ${formatUsd(u.data().wallet)} in their wallet.`, status: 402 };
        }
        tx.update(userRef, { wallet: FV().increment(-AGENT_APPLICATION_FEE) });
        ledger("Agent Application Fee", -AGENT_APPLICATION_FEE);
      }
      tx.update(agentRef, {
        application_status: "approved", reviewed_at: now, active: true, total_trades: Number(app.total_trades) || 0,
        agent_balance: Number(app.agent_balance) || 0, deposit_rate: Number(app.deposit_rate) || 0, withdrawal_rate: Number(app.withdrawal_rate) || 0,
        ...(feeDue ? { applicationFee: AGENT_APPLICATION_FEE, applicationFeePaidAt: now, applicationFeeRefunded: false } : {}),
      });
      tx.update(userRef, { isAgent: true, agentStatus: "approved" });
      return { app, refunded: 0 };
    }
    const refund = app.applicationFeePaidAt && !app.applicationFeeRefunded && app.application_status !== "approved" ? Number(app.applicationFee) || 0 : 0;
    if (refund > 0) {
      tx.update(userRef, { wallet: FV().increment(refund) });
      ledger("Agent Application Fee Refund", refund);
    }
    tx.update(agentRef, {
      application_status: "rejected", reviewed_at: now, rejected_at: now, active: false,
      ...(refund > 0 ? { applicationFeeRefunded: true } : {}),
    });
    tx.update(userRef, { isAgent: false, agentStatus: "rejected" });
    return { app, refunded: refund };
  });
  if (out.error) return fail(out.error, out.status);
  const approved = decision === "approved";
  const message = approved
    ? "Your application to join the StraWins Agent Network has been approved. You can now open your agent dashboard."
    : `Your application to join the StraWins Agent Network has been declined.${out.refunded ? ` Your ${formatUsd(out.refunded)} fee is back in your wallet.` : ""}`;
  await Promise.all([
    notify(out.app.email, `Agent Application ${approved ? "Approved" : "Declined"}`, `<div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
      <h2>Application Status Update</h2><p>${message}</p><p style="font-size: 12px; color: #777;">StraWins Global Liquidity Control</p></div>`, { uid: agentId, kind: "trades" }),
    notifyUser(db, agentId, { type: approved ? "success" : "warning", title: `Agent application ${approved ? "approved" : "declined"}`, body: message, url: approved ? "/agent/dashboard" : "/agent/apply" }),
  ]);
  return NextResponse.json({ ok: true, refunded: out.refunded });
}

async function rates(db, caller, body) {
  const deposit = Number(body.deposit_rate);
  const withdrawal = Number(body.withdrawal_rate);
  if (!(deposit >= 0) || !(withdrawal >= 0) || deposit > 1e9 || withdrawal > 1e9) return fail("Enter valid rates.");
  const depositTiers = cleanRateTiers(body.deposit_tiers);
  const withdrawalTiers = cleanRateTiers(body.withdrawal_tiers);
  const bad = depositTiers.error || withdrawalTiers.error;
  if (bad) return fail(bad);
  const agentRef = db.collection("agents").doc(caller.uid);
  const a = await agentRef.get();
  if (!a.exists || a.data().application_status !== "approved") return fail("Only approved agents set rates.", 403);
  await agentRef.update({
    deposit_rate: deposit, withdrawal_rate: withdrawal, deposit_tiers: depositTiers, withdrawal_tiers: withdrawalTiers,
    ratesUpdatedAt: FV().serverTimestamp(),
  });
  return NextResponse.json({ ok: true });
}

async function bank(db, caller, body) {
  const details = { bankName: text(body.bankName, 60), accountName: text(body.accountName), accountNumber: String(body.accountNumber ?? "").replace(/[\s-]/g, "") };
  const phone = body.phone === undefined ? null : text(body.phone, 30);
  if (details.bankName.length < 2) return fail("Enter your bank name.");
  if (!/^[0-9A-Za-z]{6,34}$/.test(details.accountNumber)) return fail("Enter a valid account number.");
  if (phone && !/^[+\d][\d\s()-]{5,}$/.test(phone)) return fail("Enter a valid phone number.");
  const agentRef = db.collection("agents").doc(caller.uid);
  const a = await agentRef.get();
  if (!a.exists || a.data().application_status !== "approved") return fail("Only approved agents change their bank details here.", 403);
  const name = a.data().full_name || "";
  if (!sameAccountName(name, details.accountName)) {
    return fail(`The account must be in your approved agent name, ${name}. Agents can only trade with a bank account in their own name.`);
  }
  await agentRef.update({ ...details, ...(phone !== null ? { phone_number: phone } : {}), profileUpdatedAt: FV().serverTimestamp() });
  return NextResponse.json({ ok: true });
}

async function adminEdit(db, caller, body) {
  if (!(await isAdminCaller(db, caller))) return fail("Administrative access required.", 403);
  const { agentId } = body;
  if (!agentId || typeof agentId !== "string") return fail("Agent not found.", 404);
  const details = {
    full_name: text(body.fullName), email: text(body.email, 120).toLowerCase(), phone_number: text(body.phone, 30),
    country: text(body.country, 60), age: text(body.age, 3),
    bankName: text(body.bankName, 60), accountName: text(body.accountName), accountNumber: String(body.accountNumber ?? "").replace(/[\s-]/g, ""),
    deposit_rate: Number(body.deposit_rate), withdrawal_rate: Number(body.withdrawal_rate),
  };
  if (details.full_name.split(" ").length < 2) return fail("Enter the agent's full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) return fail("Enter a valid email.");
  if (details.phone_number && !/^[+\d][\d\s()-]{5,}$/.test(details.phone_number)) return fail("Enter a valid phone number.");
  if (!details.country) return fail("Enter the agent's country.");
  if (details.age && !(Number(details.age) >= 18 && Number(details.age) <= 120)) return fail("Agents must be 18 or older.");
  if (details.accountNumber && !/^[0-9A-Za-z]{6,34}$/.test(details.accountNumber)) return fail("Enter a valid account number.");
  const badRate = (r) => !(r >= 0) || r > 1e9;
  if (badRate(details.deposit_rate) || badRate(details.withdrawal_rate)) return fail("Enter valid rates.");
  const agentRef = db.collection("agents").doc(agentId);
  const a = await agentRef.get();
  if (!a.exists) return fail("Agent not found.", 404);
  await agentRef.update({ ...details, editedAt: FV().serverTimestamp(), editedBy: caller.uid });
  return NextResponse.json({ ok: true, bankMatches: agentBankMatches(details) });
}

async function adminDelete(db, caller, { agentId }) {
  if (!(await isAdminCaller(db, caller))) return fail("Administrative access required.", 403);
  if (!agentId || typeof agentId !== "string") return fail("Agent not found.", 404);
  const userRef = db.collection("users").doc(agentId);
  const agentRef = db.collection("agents").doc(agentId);
  const trades = db.collection("trades").where("agentId", "==", agentId);
  const out = await db.runTransaction(async (tx) => {
    const open = await Promise.all(OPEN_TRADE_STATUSES.map((s) => tx.get(trades.where("status", "==", s).limit(1))));
    const [u, a] = await tx.getAll(userRef, agentRef);
    if (!a.exists) return { error: "Agent not found.", status: 404 };
    if (open.some((snap) => !snap.empty)) {
      return { error: "This agent has a trade that's still open. Let it finish, or cancel it on Agent TX, then delete the agent.", status: 409 };
    }
    const app = a.data();
    const returnedC = Math.max(0, cents(app.agent_balance));
    const refund = app.applicationFeePaidAt && !app.applicationFeeRefunded && app.application_status !== "approved" ? Number(app.applicationFee) || 0 : 0;
    tx.delete(agentRef);
    if (!u.exists) return { app, returned: 0, refunded: 0 };
    const now = FV().serverTimestamp();
    const ledger = (title, amount) => tx.set(userRef.collection("transactions").doc(), {
      title, amount, type: "adjustment", status: "completed", timestamp: now, description: "Agent account closed by an admin",
    });
    if (returnedC > 0) ledger("Agent Balance Returned", toDollars(returnedC));
    if (refund > 0) ledger("Agent Application Fee Refund", refund);
    tx.update(userRef, {
      isAgent: false, agentStatus: FV().delete(), hasApplied: false,
      ...(returnedC + cents(refund) > 0 ? { wallet: FV().increment(toDollars(returnedC + cents(refund))) } : {}),
    });
    return { app, returned: toDollars(returnedC), refunded: refund };
  });
  if (out.error) return fail(out.error, out.status);
  // Their ratings go too, so a new agent account starts its tally (agents/{id}.ratingCount) from nothing.
  const ratings = await db.collection("agent_ratings").where("agentId", "==", agentId).get();
  for (let i = 0; i < ratings.docs.length; i += 400) {
    const batch = db.batch();
    ratings.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  const back = [out.returned > 0 && `${formatUsd(out.returned)} from your agent balance`, out.refunded > 0 && `your ${formatUsd(out.refunded)} application fee`].filter(Boolean);
  await notifyUser(db, agentId, {
    type: "warning", title: "Agent account closed",
    body: `An admin closed your StraWins agent account.${back.length ? ` ${back.join(" and ")} ${back.length > 1 ? "are" : "is"} back in your main wallet.` : ""} Contact support if you have questions.`,
    url: "/support",
  });
  return NextResponse.json({ ok: true, returned: out.returned, refunded: out.refunded });
}

const ACTIONS = { apply, decide, rates, bank, adminEdit, adminDelete };

export async function POST(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const body = await req.json().catch(() => ({}));
    const run = Object.hasOwn(ACTIONS, body.action) ? ACTIONS[body.action] : null;
    if (!run) return fail("Unknown action.");
    return await run(getAdminDb(), caller, body);
  } catch (e) {
    console.error("Agent error:", e);
    return fail("Something went wrong. Please try again.", 500);
  }
}
