import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { resolvePrivilegedRole } from "@/lib/adminAccess";
import { FV, cents, formatUsd, isBanned, toDollars } from "@/lib/money";
import {
  INFLOW_ACCESS_PRICE, INFLOW_CATEGORIES, INFLOW_MIN_AGE_MONTHS, INFLOW_PAYOUT_DAY,
  creditInflowSafely, inflowEligibility, inflowLedger, inflowRecords, isPayoutDay, nextPayoutMs,
} from "@/lib/inflowBonus";

// The inflow bonus (lib/inflowBonus): what the account has earned, whether it can
// earn, and moving it to the main wallet.
//
//   GET                                    -> { eligible, purchased, eligibleAt, minAgeMonths, accessPrice, balance,
//                                               earned, payoutDay, payoutToday, nextPayoutAt, categories, history }
//                                               categories: [{ key, label, rate, text, earned, count }], what each has paid so far
//   POST { action: "buyAccess" }           -> { balance }   $250 from the main wallet unlocks it before 8 months
//   POST { action: "withdraw" }            -> { amount, balance }   the whole bonus to the main wallet, on the 15th (UTC)
//   POST { action: "settle", kind, id }    -> { credited }  admin/staff, after approving a USDT deposit or withdrawal

const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const users = (db) => db.collection("users");
const HISTORY = 100;
const ms = (ts) => ts?.toMillis?.() || null;

async function view(db, caller) {
  const snap = await users(db).doc(caller.uid).get();
  if (!snap.exists) return fail("Account not found.", 404);
  const me = snap.data();
  const [status, records, all] = await Promise.all([
    inflowEligibility(caller.uid, me),
    inflowRecords(db, caller.uid).orderBy("createdAt", "desc").limit(HISTORY).get(),
    inflowRecords(db, caller.uid).select("category", "amount").get(),
  ]);
  // Totals per category over the whole history, not just the latest records shown.
  const totals = new Map();
  for (const d of all.docs) {
    const { category, amount } = d.data();
    const t = totals.get(category) || { earnedC: 0, count: 0 };
    totals.set(category, { earnedC: t.earnedC + cents(amount), count: t.count + 1 });
  }
  const history = records.docs.map((d) => {
    const r = d.data();
    return { id: d.id, category: r.category, amount: Number(r.amount || 0), base: Number(r.base || 0), rate: r.rate ?? null, note: r.note || "", createdAt: ms(r.createdAt) };
  });
  return NextResponse.json({
    ...status,
    minAgeMonths: INFLOW_MIN_AGE_MONTHS,
    accessPrice: INFLOW_ACCESS_PRICE,
    balance: Number(me.inflowBonus || 0),
    earned: Number(me.inflowEarned || 0),
    payoutDay: INFLOW_PAYOUT_DAY,
    payoutToday: isPayoutDay(),
    nextPayoutAt: nextPayoutMs(),
    categories: Object.entries(INFLOW_CATEGORIES).map(([key, c]) => ({
      key, label: c.label, rate: c.rate, text: c.text,
      earned: toDollars(totals.get(key)?.earnedC || 0), count: totals.get(key)?.count || 0,
    })),
    history,
  });
}

async function buyAccess(db, caller) {
  const userRef = users(db).doc(caller.uid);
  const first = await userRef.get();
  if (!first.exists) return fail("Account not found.", 404);
  if ((await inflowEligibility(caller.uid, first.data())).eligible) return fail("You already have the inflow bonus.", 409);
  const priceC = cents(INFLOW_ACCESS_PRICE);
  const out = await db.runTransaction(async (tx) => {
    const me = (await tx.get(userRef)).data();
    if (isBanned(me)) return { error: "Your account can't move money.", status: 403 };
    if (me.inflowAccess === true) return { error: "You already have the inflow bonus.", status: 409 };
    if (cents(me.wallet) < priceC) {
      return { error: `Insufficient balance. Inflow bonus access costs ${formatUsd(INFLOW_ACCESS_PRICE)}; you have ${formatUsd(me.wallet)}.`, status: 402 };
    }
    const now = FV().serverTimestamp();
    tx.update(userRef, { wallet: FV().increment(-INFLOW_ACCESS_PRICE), inflowAccess: true, inflowAccessAt: now });
    tx.set(userRef.collection("transactions").doc(), {
      title: "Inflow Bonus Access", amount: -INFLOW_ACCESS_PRICE, type: "inflow_access", category: "finance", status: "completed",
      description: `Unlocked the inflow bonus for ${formatUsd(INFLOW_ACCESS_PRICE)}`, timestamp: now,
    });
    tx.set(inflowLedger(db).doc(), {
      kind: "access", userId: caller.uid, username: me.username || "", fullName: me.fullName || "", amount: INFLOW_ACCESS_PRICE, createdAt: now,
    });
    return { balance: toDollars(cents(me.wallet) - priceC) };
  });
  if (out.error) return fail(out.error, out.status);
  return NextResponse.json(out);
}

async function withdraw(db, caller) {
  if (!isPayoutDay()) {
    return fail(`The inflow bonus moves to your main wallet on the ${INFLOW_PAYOUT_DAY}th of each month.`, 403);
  }
  const userRef = users(db).doc(caller.uid);
  const out = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return { error: "Account not found.", status: 404 };
    const me = snap.data();
    if (isBanned(me)) return { error: "Your account can't move money.", status: 403 };
    const bonusC = cents(me.inflowBonus);
    if (bonusC <= 0) return { error: "You have no inflow bonus to withdraw yet.", status: 409 };
    const amount = toDollars(bonusC);
    const now = FV().serverTimestamp();
    tx.update(userRef, { inflowBonus: FV().increment(-amount), wallet: FV().increment(amount) });
    tx.set(inflowRecords(db, caller.uid).doc(), { category: "payout", amount: -amount, note: "Moved to main wallet", createdAt: now });
    tx.set(userRef.collection("transactions").doc(), {
      title: "Inflow Bonus Withdrawal", amount, type: "inflow_withdrawal", status: "completed",
      description: `Moved ${formatUsd(amount)} inflow bonus to main wallet`, timestamp: now,
    });
    tx.set(inflowLedger(db).doc(), {
      kind: "payout", userId: caller.uid, username: me.username || "", fullName: me.fullName || "", amount, createdAt: now,
    });
    return { amount, balance: toDollars(cents(me.wallet) + bonusC) };
  });
  if (out.error) return fail(out.error, out.status);
  return NextResponse.json(out);
}

// Admins approve USDT deposits and withdrawals in the admin pages, then call this.
// It only credits what the record says actually happened, and only once.
async function settle(db, caller, { kind, id }) {
  const me = (await users(db).doc(caller.uid).get()).data();
  if (!resolvePrivilegedRole(me?.role, caller.email)) return fail("Staff only.", 403);
  if (!id || typeof id !== "string") return fail("Record not found.", 404);
  const isDeposit = kind === "deposit";
  if (!isDeposit && kind !== "withdrawal") return fail("Choose deposit or withdrawal.");
  const snap = await db.collection(isDeposit ? "deposits" : "withdrawals").doc(id).get();
  if (!snap.exists) return fail("Record not found.", 404);
  const r = snap.data();
  if (r.status !== (isDeposit ? "completed" : "approved")) return fail(`This ${kind} hasn't been approved.`, 409);
  const credited = await creditInflowSafely(db, {
    uid: r.userId, category: kind, base: Number(r.amount), sourceId: `usdt_${id}`, note: isDeposit ? "USDT deposit" : "USDT withdrawal",
  });
  return NextResponse.json({ credited });
}

const ACTIONS = { buyAccess, withdraw, settle };

export async function GET(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    return await view(getAdminDb(), caller);
  } catch (e) {
    console.error("Inflow view error:", e);
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
    console.error("Inflow error:", e);
    return fail("Something went wrong. Please try again.", 500);
  }
}
