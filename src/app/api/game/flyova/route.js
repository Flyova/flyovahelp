import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { FV, MAX_AMOUNT, cents, formatUsd, isBanned, toDollars } from "@/lib/money";

// StraWins (the 2-minute rounds in timed_games, run by /api/cron/game-engine). A
// round shows 4 numbers; 2 of them win, and stay on the server-only
// timed_game_secrets doc until the round ends. Stakes are placed here so the
// wallet pays for every one the engine later settles.
//
//   POST { action: "stake", gameId, picks: [a, b], amount } -> { balance }
//   GET ?view=result&id=   -> { winners, numbers }  once the round has ended (425 before)

const fail = (error, status = 400) => NextResponse.json({ error }, { status });
// Stakes close a moment before the end, so none can land after the result is out.
const STAKE_CUTOFF_MS = 1500;

async function stake(db, caller, { gameId, picks, amount }) {
  const value = Number(amount);
  if (!Number.isInteger(value) || value < 1 || value > MAX_AMOUNT) return fail("Stake a whole number of dollars, at least $1.");
  if (!Array.isArray(picks) || picks.length !== 2 || picks[0] === picks[1]) return fail("Pick 2 different numbers.");
  if (!gameId || typeof gameId !== "string") return fail("This round has ended.", 409);
  const roundRef = db.collection("timed_games").doc(gameId);
  const userRef = db.collection("users").doc(caller.uid);

  const out = await db.runTransaction(async (tx) => {
    const [round, u] = await tx.getAll(roundRef, userRef);
    if (!round.exists || round.data().status !== "active" || Number(round.data().endTime) - Date.now() < STAKE_CUTOFF_MS) {
      return { error: "This round has ended. Wait for the next one.", status: 409 };
    }
    const numbers = Array.isArray(round.data().numbers) ? round.data().numbers : [];
    if (!picks.every((p) => numbers.includes(p))) return { error: "Pick 2 of this round's numbers.", status: 400 };
    if (!u.exists) return { error: "Account not found.", status: 404 };
    if (isBanned(u.data())) return { error: "Your account can't play.", status: 403 };
    if (cents(u.data().wallet) < cents(value)) {
      return { error: `Insufficient balance: ${formatUsd(value)} needed, ${formatUsd(u.data().wallet)} available.`, status: 402 };
    }
    tx.update(userRef, { wallet: FV().increment(-value) });
    tx.set(userRef.collection("transactions").doc(), {
      title: "StraWins Stake", amount: value, picks: [...picks], gameId, type: "stake", status: "pending",
      timestamp: FV().serverTimestamp(),
    });
    return { balance: toDollars(cents(u.data().wallet) - cents(value)) };
  });
  if (out.error) return fail(out.error, out.status);
  return NextResponse.json(out);
}

async function resultView(db, params) {
  const id = String(params.get("id") || "");
  if (!id) return fail("Round not found.", 404);
  const round = await db.collection("timed_games").doc(id).get();
  if (!round.exists) return fail("Round not found.", 404);
  if (Number(round.data().endTime) > Date.now()) return fail("This round is still running.", 425);
  const secret = await db.collection("timed_game_secrets").doc(id).get();
  const winners = [secret.data()?.winners, round.data().winners].find(Array.isArray) || [];
  return NextResponse.json({ winners, numbers: round.data().numbers || [] });
}

export async function GET(req) {
  try {
    if (!(await getCaller(req))) return fail("Sign in again to continue.", 401);
    const params = new URL(req.url).searchParams;
    if (params.get("view") !== "result") return fail("Unknown view.");
    return await resultView(getAdminDb(), params);
  } catch (e) {
    console.error("StraWins result error:", e);
    return fail("Something went wrong. Please try again.", 500);
  }
}

export async function POST(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const body = await req.json().catch(() => ({}));
    if (body.action !== "stake") return fail("Unknown action.");
    return await stake(getAdminDb(), caller, body);
  } catch (e) {
    console.error("StraWins stake error:", e);
    return fail("Something went wrong. Please try again.", 500);
  }
}
