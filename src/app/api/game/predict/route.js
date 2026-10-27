import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { FV, cents, formatUsd, isBanned, toDollars } from "@/lib/money";
import { predictPlanEmail } from "@/lib/moneyEmails";

// Predict & Win. Players with an active plan predict each 60-second round's outcome
// (Odd, Even or Both) and win $0.20 when right. Rounds used to be made by players'
// apps with the outcome readable from the start, and apps paid out their own wins;
// now the server makes each round on a fixed clock (60s of predicting, then 10s of
// results), keeps the outcome on the server-only predict_secrets doc until the round
// ends, and pays here.
//
//   GET ?view=round                      -> { id, startTime, endTime, nextAt }  the current round (made if
//                                           missing); during the 10s of results, the one that just ended
//   GET ?view=result&id=                 -> { condition, n1, n2 }       once that round has ended (425 before)
//   POST { action: "plan", plan }        -> { balance, expires }        buy a plan (one at a time)
//   POST { action: "predict", gameId, choice }  -> { ok }               one prediction per round
//   POST { action: "settle" }            -> { results: [{ gameId, result, condition, n1, n2 }], credited }
//                                           pays the caller's predictions on rounds that have ended

const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const WIN_REWARD = 0.2;
const ROUND_MS = 60000;
const SLOT_MS = ROUND_MS + 10000;
const PREDICT_CUTOFF_MS = 1000;
const CHOICES = ["Odd", "Even", "Both"];
const PLANS = {
  "3h": { name: "3 Hours", price: 12, duration: 3 * 3600000 },
  "5h": { name: "5 Hours", price: 20, duration: 5 * 3600000 },
  "12h": { name: "12 Hours", price: 45, duration: 12 * 3600000 },
  "1d": { name: "1 Day", price: 88, duration: 24 * 3600000 },
  "1w": { name: "1 Week", price: 600, duration: 7 * 24 * 3600000 },
};
const random = (n) => Math.floor(Math.random() * n);
const predictionId = (gameId) => `predict_${gameId}`;
const expiresMs = (u) => u?.subscription_expires?.toMillis?.() || 0;

/** The round for the current 70s slot, made (with its secret outcome) the first time anyone asks. */
async function currentRound(db) {
  const slot = Math.floor(Date.now() / SLOT_MS);
  const startTime = slot * SLOT_MS;
  const round = { id: `slot_${slot}`, startTime, endTime: startTime + ROUND_MS, nextAt: startTime + SLOT_MS };
  const ref = db.collection("predict_games").doc(round.id);
  if ((await ref.get()).exists) return round;
  await db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) return;
    tx.create(ref, { startTime, endTime: round.endTime, status: "active", createdAt: FV().serverTimestamp() });
    tx.create(db.collection("predict_secrets").doc(round.id), {
      condition: CHOICES[random(3)], n1: random(50) + 1, n2: random(50) + 1, endTime: round.endTime,
    });
  });
  return round;
}

/** An ended round's outcome, copied onto the public round the first time it's needed. */
async function revealed(db, gameId) {
  const ref = db.collection("predict_games").doc(gameId);
  const snap = await ref.get();
  if (!snap.exists || Number(snap.data().endTime) > Date.now()) return null;
  if (snap.data().condition) return snap.data(); // revealed already, or made by an older app
  const secret = (await db.collection("predict_secrets").doc(gameId).get()).data();
  if (!secret) return null;
  const outcome = { condition: secret.condition, n1: secret.n1, n2: secret.n2 };
  await ref.update({ ...outcome, status: "completed" });
  return outcome;
}

async function plan(db, caller, { plan: planId }) {
  const p = Object.hasOwn(PLANS, planId) ? PLANS[planId] : null;
  if (!p) return fail("Choose a plan.");
  const userRef = db.collection("users").doc(caller.uid);
  const out = await db.runTransaction(async (tx) => {
    const u = await tx.get(userRef);
    if (!u.exists) return { error: "Account not found.", status: 404 };
    const me = u.data();
    if (isBanned(me)) return { error: "Your account can't play.", status: 403 };
    if (expiresMs(me) > Date.now()) return { error: "You already have an active plan.", status: 409 };
    if (cents(me.wallet) < cents(p.price)) {
      return { error: `Insufficient balance. Plan: ${formatUsd(p.price)} | Available: ${formatUsd(me.wallet)}`, status: 402 };
    }
    const now = Date.now();
    tx.update(userRef, {
      wallet: FV().increment(-p.price),
      subscription_expires: new Date(now + p.duration),
      subscription_started_at: new Date(now),
    });
    tx.set(userRef.collection("transactions").doc(), {
      title: `Predict Stake: ${p.name}`, amount: p.price, type: "stake", status: "loss", timestamp: FV().serverTimestamp(),
    });
    return { me, expires: now + p.duration, balance: toDollars(cents(me.wallet) - cents(p.price)) };
  });
  if (out.error) return fail(out.error, out.status);
  await predictPlanEmail({ to: out.me.email, name: out.me.fullName, plan: p.name, price: p.price, expires: out.expires });
  return NextResponse.json({ balance: out.balance, expires: out.expires });
}

async function predict(db, caller, { gameId, choice }) {
  if (!CHOICES.includes(choice)) return fail("Choose Odd, Even or Both.");
  if (!gameId || typeof gameId !== "string") return fail("This round has ended.", 409);
  const userRef = db.collection("users").doc(caller.uid);
  const roundRef = db.collection("predict_games").doc(gameId);
  const entryRef = userRef.collection("transactions").doc(predictionId(gameId));
  const out = await db.runTransaction(async (tx) => {
    const [u, round, entry] = await tx.getAll(userRef, roundRef, entryRef);
    if (!u.exists) return { error: "Account not found.", status: 404 };
    if (isBanned(u.data())) return { error: "Your account can't play.", status: 403 };
    if (expiresMs(u.data()) <= Date.now()) return { error: "Your plan has expired. Choose a plan to keep playing.", status: 402 };
    if (!round.exists || Number(round.data().endTime) - Date.now() < PREDICT_CUTOFF_MS) {
      return { error: "This round has ended. Wait for the next one.", status: 409 };
    }
    if (entry.exists) return { error: "You already predicted this round.", status: 409 };
    tx.create(entryRef, {
      title: "Predict and Win", gameId, prediction: choice, amount: 0, type: "prediction", status: "pending",
      timestamp: FV().serverTimestamp(),
    });
    return {};
  });
  if (out.error) return fail(out.error, out.status);
  return NextResponse.json({ ok: true });
}

async function settle(db, caller) {
  const userRef = db.collection("users").doc(caller.uid);
  const pending = await userRef.collection("transactions")
    .where("type", "==", "prediction").where("status", "==", "pending").limit(50).get();
  const results = [];
  let creditedC = 0;
  for (const row of pending.docs) {
    const outcome = await revealed(db, row.data().gameId);
    if (!outcome) continue; // still running
    const result = await db.runTransaction(async (tx) => {
      const live = await tx.get(row.ref);
      if (live.data()?.status !== "pending") return null;
      const now = FV().serverTimestamp();
      if (live.data().prediction === outcome.condition) {
        tx.update(userRef, { wallet: FV().increment(WIN_REWARD) });
        tx.update(row.ref, { title: "Predict Win", amount: WIN_REWARD, status: "win", type: "win", timestamp: now });
        return "win";
      }
      tx.update(row.ref, { status: "loss", timestamp: now });
      return "lose";
    });
    if (!result) continue;
    if (result === "win") creditedC += cents(WIN_REWARD);
    results.push({ gameId: row.data().gameId, result, condition: outcome.condition, n1: outcome.n1, n2: outcome.n2 });
  }
  return NextResponse.json({ results, credited: toDollars(creditedC) });
}

export async function GET(req) {
  try {
    if (!(await getCaller(req))) return fail("Sign in again to continue.", 401);
    const view = new URL(req.url).searchParams.get("view");
    if (view === "round") return NextResponse.json(await currentRound(getAdminDb()));
    if (view === "result") {
      const outcome = await revealed(getAdminDb(), String(new URL(req.url).searchParams.get("id") || ""));
      return outcome ? NextResponse.json(outcome) : fail("This round is still running.", 425);
    }
    return fail("Unknown view.");
  } catch (e) {
    console.error("Predict view error:", e);
    return fail("Something went wrong. Please try again.", 500);
  }
}

const ACTIONS = { plan, predict, settle };

export async function POST(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const body = await req.json().catch(() => ({}));
    const run = Object.hasOwn(ACTIONS, body.action) ? ACTIONS[body.action] : null;
    if (!run) return fail("Unknown action.");
    return await run(getAdminDb(), caller, body);
  } catch (e) {
    console.error("Predict error:", e);
    return fail("Something went wrong. Please try again.", 500);
  }
}
