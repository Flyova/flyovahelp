import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import {
  BONUS_REPAYMENT, DEPOSIT_WINDOW_MS, FV, MIN_DEPOSIT, MIN_QUALIFIED_REFERRALS, MIN_QUALIFYING_DEPOSIT, MIN_TRANSFER,
  MIN_WITHDRAWAL, USDT_ADDRESS, USDT_NETWORK, accountCreatedMs, cents, formatUsd, hasQualifyingDeposit, isBanned,
  isValidAccountName, owesBonus, parseAmount, referralsOf, systemSettings, toDollars, transferFee, withdrawalFee,
} from "@/lib/money";
import { depositProofEmail, transferReceivedEmail, usdtWithdrawalEmails } from "@/lib/moneyEmails";
import { creditInflowSafely } from "@/lib/inflowBonus";
import { OLD_ACCOUNT_QUALIFIED_REFERRALS, inFreeWithdrawalWindow, isFreeWithdrawal, isOldAccount, monthKey } from "@/lib/accountPerks";

// The main wallet, users/{uid}.wallet. Players' apps can only read it (Firestore
// rules); every change is made here, inside one transaction that checks it.
//
//   GET ?view=recipient&pin=                    -> { name }            who a PIN belongs to
//   GET ?view=referrals                         -> { referrals, qualified, needed, bonus }
//   POST { action: "transfer", pin, amount }    -> { record, balance } fee + any $3 bonus repayment on top
//   POST { action: "withdraw", amount, address }-> { balance, id, fee } USDT; local-agent withdrawals are trades (/api/trades);
//                                                                       free once a month for 18-month accounts (lib/accountPerks)
//   POST { action: "referral", amount }         -> { balance }         referral bonus to the main wallet
//   POST { action: "jackpot", id }              -> { balance, amount } claim a jackpot an admin gave you
//   POST { action: "deposit", amount }          -> { id, amount, existing } start (or resume) a USDT deposit
//   POST { action: "depositProof", id, hash, image }  -> { ok }        payment hash + screenshot for the admins
//   POST { action: "depositCancel", id }        -> { ok }              an unpaid USDT deposit whose window ran out

const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const users = (db) => db.collection("users");
const PROOF_IMAGE = /^https:\/\/res\.cloudinary\.com\/dq9o866sc\/image\/upload\/[\w\-./%]+$/;
const TRC20_ADDRESS = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const notEnough = (needC, haveC, what) =>
  ({ error: `Insufficient balance. You need ${formatUsd(toDollars(needC))}${what ? ` (${what})` : ""}; you have ${formatUsd(toDollars(haveC))}.`, status: 402 });

/** The account a PIN belongs to (8 digits), or null. */
async function accountByPin(db, pin) {
  const p = String(pin || "").replace(/\D/g, "");
  if (p.length !== 8) return null;
  const snap = await users(db).where("pin", "==", p).limit(1).get();
  return snap.empty ? null : snap.docs[0];
}

async function transfer(db, caller, { pin, amount }) {
  const value = parseAmount(amount, { min: MIN_TRANSFER });
  if (value === null) return fail(`Minimum transfer is ${formatUsd(MIN_TRANSFER)}.`);
  const target = await accountByPin(db, pin);
  if (!target) return fail("Please enter a valid recipient PIN.", 404);
  if (target.id === caller.uid) return fail("You can't send money to yourself.");
  const fee = transferFee(value);
  const senderRef = users(db).doc(caller.uid);
  const receiverRef = users(db).doc(target.id);

  const out = await db.runTransaction(async (tx) => {
    const [s, r] = await tx.getAll(senderRef, receiverRef);
    if (!s.exists || !r.exists) return { error: "Account not found.", status: 404 };
    const me = s.data();
    const them = r.data();
    if (isBanned(me)) return { error: "Your account can't send money.", status: 403 };
    if (me.restrictTransfer) return { error: "Transfers have been restricted on your account. Please contact support.", status: 403 };
    const bonus = owesBonus(me) ? BONUS_REPAYMENT : 0;
    const totalC = cents(value) + cents(fee) + cents(bonus);
    if (cents(me.wallet) < totalC) {
      return notEnough(totalC, cents(me.wallet), bonus ? `amount + ${formatUsd(fee)} fee + ${formatUsd(bonus)} bonus repayment` : "amount + fee");
    }
    const now = FV().serverTimestamp();
    tx.update(senderRef, {
      wallet: FV().increment(-toDollars(totalC)),
      ...(bonus ? { bonusClaimed: false, bonusDeducted: true, welcomeBonusStatus: "recovered", welcomeBonusRecoveredAt: now } : {}),
    });
    tx.update(receiverRef, { wallet: FV().increment(value) });
    const record = {
      amount: value, fee, bonusRepaid: bonus,
      senderId: caller.uid, senderName: me.fullName || me.username || "", senderPin: me.pin || "",
      receiverId: target.id, receiverName: them.fullName || them.username || "", receiverPin: them.pin || "",
      type: "p2p_transfer", status: "completed", txId: `TX-${Date.now()}`,
    };
    const sent = senderRef.collection("transactions").doc();
    tx.set(sent, { ...record, amount: -value, direction: "out", timestamp: now });
    tx.set(receiverRef.collection("transactions").doc(), { ...record, direction: "in", timestamp: now });
    return { record: { ...record, timestamp: Date.now() }, email: them.email, balance: toDollars(cents(me.wallet) - totalC), sentId: sent.id };
  });
  if (out.error) return fail(out.error, out.status);
  await Promise.all([
    transferReceivedEmail({ to: out.email, name: out.record.receiverName, senderName: out.record.senderName, amount: value, txId: out.record.txId }),
    creditInflowSafely(db, { uid: caller.uid, category: "transfer", base: value, sourceId: `transfer_${out.sentId}`, note: `To ${out.record.receiverName || "a player"}` }),
  ]);
  return NextResponse.json({ record: out.record, balance: out.balance });
}

async function withdraw(db, caller, { amount, address }) {
  const value = parseAmount(amount, { min: MIN_WITHDRAWAL });
  if (value === null) return fail(`Minimum withdrawal is ${formatUsd(MIN_WITHDRAWAL)}.`);
  const addr = String(address || "").trim();
  if (!TRC20_ADDRESS.test(addr)) return fail(`Enter a valid USDT (${USDT_NETWORK}) address. It starts with T and has 34 characters.`);
  if ((await systemSettings(db)).withdrawalEnabled === false) return fail("Withdrawals are paused right now. Please try again later.", 403);
  const userRef = users(db).doc(caller.uid);
  const withdrawalRef = db.collection("withdrawals").doc();
  const userTxRef = userRef.collection("transactions").doc();
  const today = new Date();
  // Only look up the account's age when the withdrawal could be the free one.
  const first = inFreeWithdrawalWindow(value, today) ? await userRef.get() : null;
  const createdMs = first?.exists ? await accountCreatedMs(caller.uid, first.data()) : null;

  const out = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return { error: "Account not found.", status: 404 };
    const me = snap.data();
    if (isBanned(me)) return { error: "Your account can't withdraw.", status: 403 };
    if (me.restrictWithdrawal) return { error: "Withdrawals have been restricted on your account. Please contact support.", status: 403 };
    if (!isValidAccountName(me.fullName)) {
      return { error: "Your account name is incomplete or invalid for withdrawals. It needs a full first and last name (e.g. John Doe); single names or initials aren't accepted. Contact support to update it.", status: 403 };
    }
    const free = isFreeWithdrawal({ createdMs, amount: value, usedMonth: me.freeWithdrawalMonth, now: today });
    const fee = free ? 0 : withdrawalFee(value);
    const bonus = owesBonus(me) ? BONUS_REPAYMENT : 0;
    const totalC = cents(value) + cents(fee) + cents(bonus);
    if (cents(me.wallet) < totalC) return notEnough(totalC, cents(me.wallet), "including fees/bonus recovery");
    const now = FV().serverTimestamp();
    tx.update(userRef, {
      wallet: FV().increment(-toDollars(totalC)),
      ...(bonus ? { bonusDeducted: true, welcomeBonusStatus: "recovered", welcomeBonusRecoveredAt: now } : {}),
      ...(free ? { freeWithdrawalMonth: monthKey(today) } : {}),
    });
    if (bonus) {
      tx.set(userRef.collection("transactions").doc(), {
        title: "Bonus Recovery", amount: -bonus, type: "adjustment", status: "completed", timestamp: now, details: "Signup bonus recovery",
      });
    }
    const request = {
      userId: caller.uid, amount: value, fee, bonusRecovered: bonus, totalDeducted: toDollars(totalC),
      type: "withdrawal", status: "pending", method: "usdt", details: { usdtAddress: addr }, timestamp: now,
      withdrawalId: withdrawalRef.id, userTransactionId: userTxRef.id, ...(free ? { freeWithdrawal: true } : {}),
    };
    tx.set(withdrawalRef, request);
    tx.set(userTxRef, { ...request, title: "Withdrawal Requested", amount: -value });
    return { me, bonus, fee, totalC };
  });
  if (out.error) return fail(out.error, out.status);
  await usdtWithdrawalEmails({
    email: out.me.email, name: out.me.fullName, uid: caller.uid, amount: value, fee: out.fee, bonus: out.bonus, total: toDollars(out.totalC), address: addr,
  });
  return NextResponse.json({ id: withdrawalRef.id, balance: toDollars(cents(out.me.wallet) - out.totalC), fee: out.fee });
}

/** How many of the account's referrals have made a qualifying deposit (stops counting at `enough`). */
async function qualifiedReferrals(db, uid, user, enough = Infinity) {
  let qualified = 0;
  for (const id of (await referralsOf(db, uid, user)).keys()) {
    if (await hasQualifyingDeposit(db, id)) qualified += 1;
    if (qualified >= enough) break;
  }
  return qualified;
}

/** Qualified referrals the account needs to withdraw its referral bonus: fewer once it's 18 months old. */
const referralsNeeded = async (uid, user) =>
  isOldAccount(await accountCreatedMs(uid, user)) ? OLD_ACCOUNT_QUALIFIED_REFERRALS : MIN_QUALIFIED_REFERRALS;

async function referral(db, caller, { amount }) {
  const value = parseAmount(amount, { min: 1 });
  if (value === null) return fail("Minimum withdrawal is $1.00.");
  const userRef = users(db).doc(caller.uid);
  const first = await userRef.get();
  if (!first.exists) return fail("Account not found.", 404);
  const needed = await referralsNeeded(caller.uid, first.data());
  const qualified = await qualifiedReferrals(db, caller.uid, first.data(), needed);
  if (qualified < needed) {
    return fail(`You need at least ${needed} referrals who have each deposited a minimum of ${formatUsd(MIN_QUALIFYING_DEPOSIT)} before you can withdraw your referral bonus. Currently: ${qualified}/${needed}.`, 403);
  }
  const out = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const me = snap.data();
    if (isBanned(me)) return { error: "Your account can't move money.", status: 403 };
    if (cents(me.referralBonus) < cents(value)) return { error: "Insufficient referral bonus balance.", status: 402 };
    tx.update(userRef, { referralBonus: FV().increment(-value), wallet: FV().increment(value) });
    tx.set(userRef.collection("transactions").doc(), {
      title: "Referral Bonus Withdrawal", amount: value, type: "referral_withdrawal", status: "completed",
      timestamp: FV().serverTimestamp(), description: `Transferred ${formatUsd(value)} from referral bonus to main wallet`,
    });
    return { balance: toDollars(cents(me.wallet) + cents(value)) };
  });
  if (out.error) return fail(out.error, out.status);
  return NextResponse.json(out);
}

async function jackpot(db, caller, { id }) {
  if (!id || typeof id !== "string") return fail("Choose a jackpot to claim.");
  const jackpotRef = db.collection("jackpots").doc(id);
  const userRef = users(db).doc(caller.uid);
  const out = await db.runTransaction(async (tx) => {
    const [j, u] = await tx.getAll(jackpotRef, userRef);
    if (!j.exists || j.data().userId !== caller.uid) return { error: "Jackpot not found.", status: 404 };
    if (j.data().status !== "pending") return { error: "This jackpot was already claimed.", status: 409 };
    if (!u.exists) return { error: "Account not found.", status: 404 };
    const amount = parseAmount(j.data().amount);
    if (amount === null) return { error: "This jackpot has no amount.", status: 409 };
    tx.update(jackpotRef, { status: "claimed", claimedAt: FV().serverTimestamp() });
    tx.update(userRef, { wallet: FV().increment(amount) });
    return { amount, balance: toDollars(cents(u.data().wallet) + cents(amount)) };
  });
  if (out.error) return fail(out.error, out.status);
  return NextResponse.json(out);
}

async function deposit(db, caller, { amount }) {
  const value = parseAmount(amount, { min: MIN_DEPOSIT });
  if (value === null) return fail(`Minimum deposit is ${formatUsd(MIN_DEPOSIT)}.`);
  if ((await systemSettings(db)).depositEnabled === false) return fail("Deposits are paused right now. Please try again later.", 403);
  const me = (await users(db).doc(caller.uid).get()).data();
  if (!me) return fail("Account not found.", 404);
  if (isBanned(me)) return fail("Your account can't deposit.", 403);
  if (me.restrictDeposit) return fail("Deposits have been restricted on your account. Please contact support.", 403);
  // One USDT deposit at a time: a pending one from the last 30 minutes is resumed.
  const last = await db.collection("deposits").where("userId", "==", caller.uid).where("status", "==", "pending")
    .orderBy("createdAt", "desc").limit(1).get();
  const lastMs = last.empty ? 0 : last.docs[0].data().createdAt?.toMillis?.() || 0;
  if (lastMs && Date.now() - lastMs < DEPOSIT_WINDOW_MS) {
    const d = last.docs[0];
    return NextResponse.json({ id: d.id, amount: d.data().amount, existing: true, minutesLeft: Math.ceil((DEPOSIT_WINDOW_MS - (Date.now() - lastMs)) / 60000) });
  }
  const ref = db.collection("deposits").doc();
  await ref.set({
    userId: caller.uid, amount: value, type: "deposit", status: "pending",
    network: USDT_NETWORK, addressUsed: USDT_ADDRESS, createdAt: FV().serverTimestamp(),
  });
  return NextResponse.json({ id: ref.id, amount: value, existing: false });
}

async function ownPendingDeposit(db, caller, id) {
  if (!id || typeof id !== "string") return { error: "Deposit not found.", status: 404 };
  const ref = db.collection("deposits").doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data().userId !== caller.uid) return { error: "Deposit not found.", status: 404 };
  if (snap.data().status !== "pending") return { error: "This deposit is no longer open.", status: 409 };
  return { ref, data: snap.data() };
}

async function depositProof(db, caller, { id, hash, image }) {
  const d = await ownPendingDeposit(db, caller, id);
  if (d.error) return fail(d.error, d.status);
  const h = String(hash || "").trim();
  if (!h || h.length > 200) return fail("Please enter the Transaction Hash/ID.");
  if (!PROOF_IMAGE.test(String(image || ""))) return fail("Please upload a payment screenshot.");
  await d.ref.update({ transactionHash: h, proofImage: image, submittedAt: FV().serverTimestamp(), status: "pending" });
  await depositProofEmail({ uid: caller.uid, amount: d.data.amount, hash: h, image });
  return NextResponse.json({ ok: true });
}

async function depositCancel(db, caller, { id }) {
  const d = await ownPendingDeposit(db, caller, id);
  if (d.error) return fail(d.error, d.status);
  if (d.data.proofImage || d.data.transactionHash) return fail("Your payment proof is being reviewed.", 409);
  const startedMs = d.data.createdAt?.toMillis?.() || 0;
  if (Date.now() - startedMs < DEPOSIT_WINDOW_MS) return fail("This deposit is still open.", 409);
  await d.ref.update({ status: "cancelled", cancelledAt: FV().serverTimestamp(), cancelReason: "expired" });
  return NextResponse.json({ ok: true });
}

async function recipientView(db, caller, params) {
  const target = await accountByPin(db, params.get("pin"));
  if (!target || target.id === caller.uid) return fail("No player has that PIN.", 404);
  return NextResponse.json({ name: target.data().fullName || target.data().username || "Player" });
}

async function referralsView(db, caller) {
  const snap = await users(db).doc(caller.uid).get();
  if (!snap.exists) return fail("Account not found.", 404);
  const me = snap.data();
  const [found, needed] = await Promise.all([referralsOf(db, caller.uid, me), referralsNeeded(caller.uid, me)]);
  const referrals = await Promise.all([...found].map(async ([id, u]) => ({
    id,
    username: u.username || "",
    fullName: u.fullName || "",
    pin: u.pin || "",
    createdAt: u.createdAt?.toMillis?.() || null,
    hasDeposited: await hasQualifyingDeposit(db, id),
  })));
  referrals.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return NextResponse.json({
    referrals,
    qualified: referrals.filter((r) => r.hasDeposited).length,
    needed,
    bonus: Number(me.referralBonus || 0),
  });
}

const VIEWS = { recipient: recipientView, referrals: referralsView };
const ACTIONS = { transfer, withdraw, referral, jackpot, deposit, depositProof, depositCancel };

export async function GET(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const params = new URL(req.url).searchParams;
    const view = Object.hasOwn(VIEWS, params.get("view")) ? VIEWS[params.get("view")] : null;
    if (!view) return fail("Unknown view.");
    return await view(getAdminDb(), caller, params);
  } catch (e) {
    console.error("Wallet view error:", e);
    return fail("Something went wrong. Please try again.", 500);
  }
}

export async function POST(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const body = await req.json().catch(() => ({}));
    const run = Object.hasOwn(ACTIONS, body.action) ? ACTIONS[body.action] : null;
    if (!run) return fail("Unknown action.");
    return await run(getAdminDb(), caller, body);
  } catch (e) {
    console.error("Wallet error:", e);
    return fail("Something went wrong. Please try again.", 500);
  }
}
