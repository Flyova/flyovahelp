import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { generateDistinctNumberPool } from "@/lib/gameNumbers";
import { FV, GAMES_RESTRICTED, cents, formatUsd, isBanned, isGameRestricted, referrerOf, toDollars } from "@/lib/money";
import { creditInflowSafely } from "@/lib/inflowBonus";
import { HEAD_TO_HEAD_WIN_CAP, escrowRef, matchCost, settleMatch } from "@/lib/matches";
import { notifyUser } from "@/lib/notifications";

// "Play with friends" money: a challenge (challenges/{id}, made by the challenger's
// app with its stake per round) is accepted here, which takes both stakes and opens
// the match; a completed match is paid out here (lib/matches caps it at the stakes).
// The moves themselves are still played in the apps (games/{id}).
//
//   POST { action: "accept", challengeId } -> { gameId }
//   POST { action: "settle", gameId }      -> { p1, p2 } paid (null fields: nothing left to settle)

const fail = (error, status = 400) => NextResponse.json({ error }, { status });

async function accept(db, caller, { challengeId }) {
  if (!challengeId || typeof challengeId !== "string") return fail("Challenge not found.", 404);
  const challengeRef = db.collection("challenges").doc(challengeId);
  const gameId = `match_${challengeId}`;
  const gameRef = db.collection("games").doc(gameId);

  const out = await db.runTransaction(async (tx) => {
    const chal = await tx.get(challengeRef);
    // Already accepted (a double tap, a retry, a second device) or withdrawn: nothing to charge.
    if (!chal.exists || chal.data().status !== "pending") {
      return { error: "This challenge was already accepted or is no longer available.", status: 409 };
    }
    const c = chal.data();
    if (c.to !== caller.uid) return { error: "This challenge isn't for you.", status: 403 };
    const cost = matchCost(c.stakePerRound);
    if (!cost || !c.from || c.from === caller.uid) {
      tx.delete(challengeRef);
      return { error: "This challenge isn't valid any more.", status: 409 };
    }
    const pairId = [c.from, caller.uid].sort().join("_");
    const [challenger, me, h2h] = await tx.getAll(
      db.collection("users").doc(c.from), db.collection("users").doc(caller.uid), db.collection("head_to_head").doc(pairId),
    );
    const wins = h2h.exists ? h2h.data().wins || {} : {};
    const myWins = Number(wins[caller.uid] || 0);
    const theirWins = Number(wins[c.from] || 0);
    if (Math.abs(myWins - theirWins) >= HEAD_TO_HEAD_WIN_CAP) {
      tx.delete(challengeRef);
      return { error: `You can't accept this challenge — the win gap between you two has reached the ${HEAD_TO_HEAD_WIN_CAP}-match cap (${myWins}-${theirWins}).`, status: 409 };
    }
    if (!me.exists || !challenger.exists) return { error: "Account not found.", status: 404 };
    if (isBanned(me.data())) return { error: "Your account can't play.", status: 403 };
    if (isGameRestricted(me.data())) return { error: GAMES_RESTRICTED, status: 403 };
    const totalC = cents(cost.totalCost);
    if (cents(me.data().wallet) < totalC) {
      return { error: `Insufficient balance to accept challenge. Required: ${formatUsd(cost.totalCost)} | Available: ${formatUsd(me.data().wallet)}`, status: 402 };
    }
    if (isBanned(challenger.data()) || isGameRestricted(challenger.data()) || cents(challenger.data().wallet) < totalC) {
      tx.delete(challengeRef);
      return { error: "The challenger can't cover this match any more.", status: 409 };
    }
    const now = FV().serverTimestamp();
    for (const ref of [challenger.ref, me.ref]) {
      tx.update(ref, { wallet: FV().increment(-cost.totalCost) });
      tx.set(ref.collection("transactions").doc(), {
        title: "Match Stake", amount: cost.totalCost, type: "stake", status: "loss", timestamp: now,
      });
    }
    tx.set(gameRef, {
      player1: c.from, player2: caller.uid, scores: { p1: 0, p2: 0 }, roundsPlayed: { p1: 0, p2: 0 },
      // Shown to the other player (who can't read this one's account).
      player1Name: challenger.data().username || "Player", player2Name: me.data().username || "Player",
      turn: c.from, round: 1, gameState: "picking", picker: c.from, stakePerRound: cost.stakePerRound,
      wagerPool: { p1: cost.totalWager, p2: cost.totalWager },
      status: "active", numberPool: generateDistinctNumberPool(), createdAt: Date.now(), turnStartedAt: now,
    });
    tx.set(escrowRef(db, gameId), {
      player1: c.from, player2: caller.uid, stakePerRound: cost.stakePerRound, totalWager: cost.totalWager,
      fee: cost.fee, createdAt: now,
    });
    tx.delete(challengeRef);
    return {
      gameId, balance: toDollars(cents(me.data().wallet) - totalC),
      stake: cost.stakePerRound, players: [[c.from, challenger.data()], [caller.uid, me.data()]],
    };
  });
  if (out.error) return fail(out.error, out.status);
  const [[challengerId], [, me]] = out.players;
  await notifyUser(db, challengerId, {
    type: "game", title: "Challenge accepted", body: `@${me.username || "Your friend"} accepted your challenge. Your match has started.`, url: "/game/1",
  });
  // Inflow bonus (guess scores): each player's referrer earns on the stake.
  await Promise.all(out.players.map(async ([uid, user]) => {
    const referrer = await referrerOf(db, uid, user).catch(() => null);
    if (referrer) {
      await creditInflowSafely(db, {
        uid: referrer, category: "guess_scores", base: out.stake, sourceId: `${out.gameId}_${uid}`, note: `@${user.username || "a referral"}'s friends game`,
      });
    }
  }));
  return NextResponse.json({ gameId: out.gameId, balance: out.balance });
}

async function settle(db, caller, { gameId }) {
  if (!gameId || typeof gameId !== "string") return fail("Match not found.", 404);
  const snap = await db.collection("games").doc(gameId).get();
  if (snap.exists) {
    const g = snap.data();
    if (g.player1 !== caller.uid && g.player2 !== caller.uid) return fail("Match not found.", 404);
    if (g.status !== "completed") return fail("This match isn't over yet.", 409);
  }
  const paid = await settleMatch(db, gameId);
  if (paid && snap.exists) {
    const g = snap.data();
    await Promise.all([[g.player1, paid.p1, g.player2Name], [g.player2, paid.p2, g.player1Name]].map(([uid, amount, other]) => notifyUser(db, uid, {
      type: "game", title: "Match finished",
      body: amount > 0 ? `Your match with @${other || "your friend"} is over: ${formatUsd(amount)} was paid to your wallet.` : `Your match with @${other || "your friend"} is over. Better luck next time!`,
      url: "/game/1",
    })));
  }
  return NextResponse.json({ p1: paid?.p1 ?? null, p2: paid?.p2 ?? null });
}

const ACTIONS = { accept, settle };

export async function POST(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const body = await req.json().catch(() => ({}));
    const run = Object.hasOwn(ACTIONS, body.action) ? ACTIONS[body.action] : null;
    if (!run) return fail("Unknown action.");
    return await run(getAdminDb(), caller, body);
  } catch (e) {
    console.error("Match error:", e);
    return fail("Something went wrong. Please try again.", 500);
  }
}
