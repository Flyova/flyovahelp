import { getAdminDb, admin } from "@/lib/firebaseAdmin";
import { generateDistinctNumberPool } from "@/lib/gameNumbers";
import { NextResponse } from "next/server";

// Mirrors the client-side ROUNDS_PER_PLAYER / MAX_ROUNDS / turn length used in
// src/app/game/[id]/page.js. If a "play with friends" match is abandoned (one
// or both tabs closed), there is no client left to run the forfeit timer, so
// this webhook steps the match forward turn-by-turn until it is caught up to
// real time (or completed) instead of leaving it stuck in "active" forever.
const ROUNDS_PER_PLAYER = 15;
const MAX_ROUNDS = ROUNDS_PER_PLAYER * 2;
const TURN_DURATION_MS = 60000;
// A completed match normally waits for the player to hit "Claim & Exit" (see
// finalizeAndRefund in src/app/game/[id]/page.js), which archives history and
// credits wallets. If nobody ever comes back to click it, that payout would
// sit stuck forever. This grace window gives a present player time to see the
// "Game Over" screen and claim manually before the sweep below settles it for
// them, so an actively-watching winner isn't yanked back to the lobby mid-view.
const COMPLETED_CLAIM_GRACE_MS = 3 * 60 * 1000;

// turnStartedAt is written two different ways: a live turn change sets it via
// client serverTimestamp() (arrives here as a Timestamp), while the
// catch-up loop below advances it by a fixed +TURN_DURATION_MS offset (a
// plain number), since it's synthesizing evenly-spaced past turns rather
// than anchoring to "now". Both shapes have to be accepted when reading it.
const toMillis = (value) =>
  Number(typeof value?.toMillis === "function" ? value.toMillis() : value || 0);

const forfeitOneStaleTurn = async (adminDb, gameId) => {
  const gameRef = adminDb.collection("games").doc(gameId);

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) return { advanced: false, done: true };

    const game = snap.data() || {};
    if (game.status !== "active") return { advanced: false, done: true };

    const turnStartedAt = toMillis(game.turnStartedAt) || toMillis(game.createdAt);
    const now = Date.now();
    if (now - turnStartedAt < TURN_DURATION_MS) {
      return { advanced: false, done: false };
    }

    const loserId = game.turn;
    if (!loserId || (loserId !== game.player1 && loserId !== game.player2)) {
      return { advanced: false, done: true };
    }

    const loserIsP1 = loserId === game.player1;
    const winnerScoreKey = loserIsP1 ? "scores.p2" : "scores.p1";
    const loserPoolKey = loserIsP1 ? "wagerPool.p1" : "wagerPool.p2";
    const winnerPoolKey = loserIsP1 ? "wagerPool.p2" : "wagerPool.p1";

    const liveRound = Number(game.round || 0);
    const isGameOver = liveRound >= MAX_ROUNDS;
    const nextPicker = game.picker === game.player1 ? game.player2 : game.player1;
    // Same stake transferred per forfeited round as a normal loss, so a
    // player can never end up with more than double what they staked
    // (their own stake back plus the opponent's matching stake) even when
    // the whole rest of the match is auto-forfeited.
    const winAmount = Number(game.stakePerRound || 0);
    const pickerRoundsKey = game.picker === game.player1 ? "roundsPlayed.p1" : "roundsPlayed.p2";

    const updatePayload = {
      [winnerScoreKey]: admin.firestore.FieldValue.increment(1),
      [pickerRoundsKey]: admin.firestore.FieldValue.increment(1),
      round: isGameOver ? MAX_ROUNDS : admin.firestore.FieldValue.increment(1),
      turn: nextPicker,
      picker: nextPicker,
      gameState: "picking",
      numberPool: generateDistinctNumberPool(),
      status: isGameOver ? "completed" : "active",
      // Advance the anchor by exactly one turn length (not to "now") so a
      // match abandoned for a long time gets caught up turn-by-turn within
      // this single invocation, at the same pace it would have run live.
      turnStartedAt: turnStartedAt + TURN_DURATION_MS,
    };

    if (isGameOver) {
      updatePayload.completedAt = admin.firestore.FieldValue.serverTimestamp();
    }

    if (winAmount > 0) {
      updatePayload[loserPoolKey] = admin.firestore.FieldValue.increment(-winAmount);
      updatePayload[winnerPoolKey] = admin.firestore.FieldValue.increment(winAmount);
    }

    tx.update(gameRef, updatePayload);
    return { advanced: true, done: isGameOver };
  });
};

// Same archive this game would get from POST /api/game/completed-history,
// done here with admin trust instead of a participant's ID token since there
// is no client left to call that endpoint. Idempotent: gated on whether
// completed_games/{gameId} already exists, so it's safe to run even if a
// player's own client also calls the HTTP endpoint around the same time.
const archiveCompletedGameHistory = async (adminDb, gameId, game) => {
  const [p1Snap, p2Snap] = await Promise.all([
    adminDb.collection("users").doc(game.player1).get(),
    adminDb.collection("users").doc(game.player2).get(),
  ]);
  const p1 = p1Snap.exists ? p1Snap.data() : {};
  const p2 = p2Snap.exists ? p2Snap.data() : {};
  const p1Score = Number(game?.scores?.p1 || 0);
  const p2Score = Number(game?.scores?.p2 || 0);

  const completedRef = adminDb.collection("completed_games").doc(gameId);
  const pairId = [game.player1, game.player2].sort().join("_");
  const headToHeadRef = adminDb.collection("head_to_head").doc(pairId);
  const winnerId = p1Score === p2Score ? null : (p1Score > p2Score ? game.player1 : game.player2);

  const archiveData = {
    gameId,
    amount: Number(game.stakePerRound || 0),
    player1Id: game.player1,
    player1Name: p1.fullName || p1.username || "Player 1",
    player1Email: p1.email || "",
    player1Pin: p1.pin || "",
    player1Country: p1.country || "",
    player2Id: game.player2,
    player2Name: p2.fullName || p2.username || "Player 2",
    player2Email: p2.email || "",
    player2Pin: p2.pin || "",
    player2Country: p2.country || "",
    p1RoundsPlayed: p1Score,
    p2RoundsPlayed: p2Score,
    p1Score,
    p2Score,
    totalRounds: Number(game?.round || 0),
    createdAt: game?.createdAt || null,
    finishedAt: game?.completedAt || admin.firestore.FieldValue.serverTimestamp(),
  };

  await adminDb.runTransaction(async (tx) => {
    const existingSnap = await tx.get(completedRef);
    tx.set(completedRef, archiveData, { merge: true });

    if (!existingSnap.exists && winnerId) {
      tx.set(
        headToHeadRef,
        {
          players: [game.player1, game.player2].sort(),
          [`wins.${winnerId}`]: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  });
};

// Mirrors finalizeAndRefund's credit + delete transaction: re-reads the game
// inside the transaction, so if a player's own "Claim & Exit" click wins the
// race, this simply finds the doc already gone and does nothing.
const settleCompletedGame = async (adminDb, gameId) => {
  const gameRef = adminDb.collection("games").doc(gameId);

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists) return;
    const data = snap.data() || {};
    if (data.status !== "completed") return;

    const p1Amt = Number(data.wagerPool?.p1 || 0);
    const p2Amt = Number(data.wagerPool?.p2 || 0);

    if (p1Amt > 0) {
      tx.update(adminDb.collection("users").doc(data.player1), {
        wallet: admin.firestore.FieldValue.increment(p1Amt),
      });
      tx.set(adminDb.collection("users").doc(data.player1).collection("transactions").doc(), {
        title: "Match Settlement", amount: p1Amt, type: "finance", status: "win",
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    if (p2Amt > 0) {
      tx.update(adminDb.collection("users").doc(data.player2), {
        wallet: admin.firestore.FieldValue.increment(p2Amt),
      });
      tx.set(adminDb.collection("users").doc(data.player2).collection("transactions").doc(), {
        title: "Match Settlement", amount: p2Amt, type: "finance", status: "win",
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    tx.delete(gameRef);
  });
};

const sweepUnclaimedCompletedGames = async (adminDb, now) => {
  const completedSnap = await adminDb.collection("games").where("status", "==", "completed").get();

  let settled = 0;
  for (const gameDoc of completedSnap.docs) {
    const game = gameDoc.data() || {};
    const completedAtMs = Number(
      typeof game.completedAt?.toMillis === "function" ? game.completedAt.toMillis() : game.completedAt || 0
    );
    if (completedAtMs > 0 && now - completedAtMs < COMPLETED_CLAIM_GRACE_MS) continue;

    try {
      await archiveCompletedGameHistory(adminDb, gameDoc.id, game);
      await settleCompletedGame(adminDb, gameDoc.id);
      settled += 1;
    } catch (error) {
      console.error("Failed to auto-settle abandoned game", { gameId: gameDoc.id, error: error?.message || error });
    }
  }

  return settled;
};

export async function runFriendsGameEngine() {
  const adminDb = getAdminDb();
  const now = Date.now();

  const activeSnap = await adminDb.collection("games").where("status", "==", "active").get();

  let gamesTouched = 0;
  let turnsForfeited = 0;

  for (const gameDoc of activeSnap.docs) {
    const game = gameDoc.data() || {};
    const turnStartedAt = toMillis(game.turnStartedAt) || toMillis(game.createdAt);
    if (now - turnStartedAt < TURN_DURATION_MS) continue;

    gamesTouched += 1;

    // Bounded by MAX_ROUNDS: a match can never need more forfeits than that
    // to run all the way to completion.
    for (let i = 0; i < MAX_ROUNDS; i++) {
      const result = await forfeitOneStaleTurn(adminDb, gameDoc.id);
      if (result.advanced) turnsForfeited += 1;
      if (!result.advanced || result.done) break;
    }
  }

  const unclaimedSettled = await sweepUnclaimedCompletedGames(adminDb, now);

  return { gamesTouched, turnsForfeited, unclaimedSettled };
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runFriendsGameEngine();
    return NextResponse.json({ message: "ok", ...result });
  } catch (err) {
    console.error("Friends game engine failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
