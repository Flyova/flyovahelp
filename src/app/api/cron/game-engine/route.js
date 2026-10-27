import { getAdminDb, admin, getRtdb } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";

// Fisher-Yates Shuffle Algorithm for true randomization
const shuffleArray = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

// Short TTL: a crashed run must not freeze the game for long. Settlement and round
// creation are idempotent, so an overlapping run after expiry is harmless.
const ENGINE_LOCK_TTL_MS = 45000;
const SETTLE_CHUNK_SIZE = 100; // bets per settlement transaction (<= 500 writes)
const ENGINE_LOCK_GRACE_MS = 5000;
const ENGINE_LOCK_COLLECTION = "system_locks";
const ENGINE_LOCK_DOC_ID = "flyova_game_engine_lock";
const ROUND_GUARD_COLLECTION = "system_state";
const ROUND_GUARD_DOC_ID = "flyova_round_guard";
const MAX_SWEEP_COMPLETED_GAMES = 120;
const ENGINE_STEP_TIMEOUT_MS = 8000;
const ROUND_DURATION_MS = 120000; // 2 min per round
// A round's winning numbers stay here (server only; Firestore rules deny it) until the
// round ends, then are copied onto the public timed_games doc. They used to sit on that
// doc and in the RTDB round from the start, so anyone could read them before betting.
const SECRETS_COLLECTION = "timed_game_secrets";
const emptyPendingSweep = (skipped = false) => ({
  pendingScanned: 0,
  pendingSettled: 0,
  pendingEligible: 0,
  skipped,
});

// A round is always a full ROUND_DURATION_MS measured from the moment it is created.
// Snapping to the wall-clock grid used to hand players a round that was already
// partway through (e.g. 30s left after the engine caught up), short-changing anyone
// who joined right after. Anchoring to `now` keeps rounds full-length and contiguous.
const getRoundWindow = (now) => ({
  startTime: now,
  endTime: now + ROUND_DURATION_MS,
});

const withEngineTimeout = (label, operation, timeoutMs = ENGINE_STEP_TIMEOUT_MS) => {
  let timer;
  const task = Promise.resolve().then(operation);
  task.catch(() => {});

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label} timed out`);
      error.code = "ENGINE_TIMEOUT";
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([task, timeout]).finally(() => clearTimeout(timer));
};

const acquireEngineLock = async (adminDb, ownerId) => {
  const lockRef = adminDb.collection(ENGINE_LOCK_COLLECTION).doc(ENGINE_LOCK_DOC_ID);
  const now = Date.now();

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    const data = snap.exists ? snap.data() : {};
    const expiresAt = Number(data?.expiresAt || 0);
    const activeOwner = data?.ownerId || null;
    const isLocked = expiresAt > now && activeOwner && activeOwner !== ownerId;

    if (isLocked) {
      return { acquired: false, ownerId: activeOwner, expiresAt };
    }

    tx.set(lockRef, {
      ownerId,
      expiresAt: now + ENGINE_LOCK_TTL_MS,
      acquiredAt: now,
      updatedAt: now,
    }, { merge: true });

    return { acquired: true, ownerId, expiresAt: now + ENGINE_LOCK_TTL_MS };
  });
};

const releaseEngineLock = async (adminDb, ownerId) => {
  const lockRef = adminDb.collection(ENGINE_LOCK_COLLECTION).doc(ENGINE_LOCK_DOC_ID);
  const now = Date.now();

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    if (!snap.exists) return;
    if (snap.data()?.ownerId !== ownerId) return;

    tx.set(lockRef, {
      ownerId: null,
      expiresAt: 0,
      releasedAt: now,
      updatedAt: now,
    }, { merge: true });
  });
};

const toMoney = (value) => parseFloat(Number(value || 0).toFixed(2));

/**
 * Settles a chunk of bets in ONE transaction: one read for the bets, one for their
 * users, one for referrers, one commit. Each Firestore call is a network round trip
 * on Workers, so settling bet-by-bet made rounds slow to roll over and could exceed
 * the per-request subrequest limit mid-settlement. Wallet/referral credits are summed
 * per user so each user document is written once.
 */
const settleBetChunk = async ({
  adminDb,
  betDocs,
  winningNums,
  now,
  WIN_MULTIPLIER,
  REFUND_PERCENTAGE,
  REFERRAL_COMMISSION_RATE,
}) => {
  return adminDb.runTransaction(async (tx) => {
    const betSnaps = await tx.getAll(...betDocs.map((d) => d.ref));
    const pending = betSnaps.filter(
      (snap) => snap.exists && snap.data()?.status === "pending" && snap.ref.parent.parent
    );
    if (!pending.length) return 0;

    const userRefs = [...new Map(pending.map((snap) => {
      const ref = snap.ref.parent.parent;
      return [ref.path, ref];
    })).values()];
    const userSnaps = await tx.getAll(...userRefs);
    const users = new Map(userSnaps.map((snap) => [snap.ref.path, snap]));

    const referrerIds = [...new Set(userSnaps
      .map((snap) => (snap.exists && typeof snap.data()?.referrerUid === "string" ? snap.data().referrerUid.trim() : ""))
      .filter(Boolean))];
    const referrerSnaps = referrerIds.length
      ? await tx.getAll(...referrerIds.map((id) => adminDb.collection("users").doc(id)))
      : [];
    const existingReferrers = new Set(referrerSnaps.filter((snap) => snap.exists).map((snap) => snap.id));

    // path -> { ref, wallet, referralBonus }
    const credits = new Map();
    const credit = (ref, field, amount) => {
      if (!(amount > 0)) return;
      const entry = credits.get(ref.path) || { ref, wallet: 0, referralBonus: 0 };
      entry[field] += amount;
      credits.set(ref.path, entry);
    };

    for (const betSnap of pending) {
      const bet = betSnap.data() || {};
      const userRef = betSnap.ref.parent.parent;
      const userSnap = users.get(userRef.path);
      const betAmount = Math.abs(Number(bet.amount || 0));
      const stakeAmount = Math.abs(Number(bet.stakeAmount || betAmount || 0));
      const picks = Array.isArray(bet.picks) ? bet.picks : [];
      const matches = picks.filter((num) => winningNums.includes(num)).length;

      if (matches === 2) {
        tx.update(betSnap.ref, { status: "win", matches: 2, stakeAmount, settledAt: now });
        if (userSnap?.exists) credit(userRef, "wallet", toMoney(betAmount * WIN_MULTIPLIER));
      } else if (matches === 1) {
        tx.update(betSnap.ref, { status: "partial", matches: 1, stakeAmount, settledAt: now });
        if (userSnap?.exists) credit(userRef, "wallet", toMoney(betAmount * REFUND_PERCENTAGE));
      } else {
        tx.update(betSnap.ref, { status: "loss", matches: 0, stakeAmount, settledAt: now });
        // Referral credit must never block loss settlement.
        const referrerUid = userSnap?.exists && typeof userSnap.data()?.referrerUid === "string"
          ? userSnap.data().referrerUid.trim()
          : "";
        if (referrerUid && existingReferrers.has(referrerUid)) {
          credit(adminDb.collection("users").doc(referrerUid), "referralBonus", toMoney(betAmount * REFERRAL_COMMISSION_RATE));
        }
      }
    }

    for (const { ref, wallet, referralBonus } of credits.values()) {
      const update = {};
      if (wallet > 0) update.wallet = admin.firestore.FieldValue.increment(toMoney(wallet));
      if (referralBonus > 0) update.referralBonus = admin.firestore.FieldValue.increment(toMoney(referralBonus));
      if (Object.keys(update).length) tx.update(ref, update);
    }

    return pending.length;
  });
};

const settlePendingForGame = async ({
  adminDb,
  gameId,
  winningNums,
  now,
  WIN_MULTIPLIER,
  REFUND_PERCENTAGE,
  REFERRAL_COMMISSION_RATE,
}) => {
  const pendingSnap = await adminDb.collectionGroup("transactions")
    .where("gameId", "==", gameId)
    .where("status", "==", "pending")
    .get();

  const stakes = pendingSnap.docs.filter((d) => d.data()?.type === "stake");

  let settledCount = 0;
  for (let i = 0; i < stakes.length; i += SETTLE_CHUNK_SIZE) {
    const betDocs = stakes.slice(i, i + SETTLE_CHUNK_SIZE);
    const args = { adminDb, betDocs, winningNums, now, WIN_MULTIPLIER, REFUND_PERCENTAGE, REFERRAL_COMMISSION_RATE };
    try {
      settledCount += await settleBetChunk(args);
    } catch (error) {
      // One retry: transient contention (e.g. a player staking mid-settlement) usually clears.
      try {
        settledCount += await settleBetChunk(args);
      } catch (retryError) {
        console.error("Failed to settle bet chunk", {
          gameId,
          bets: betDocs.map((d) => d.id),
          error: retryError?.message || error?.message || retryError,
        });
      }
    }
  }

  return { settledCount, scanned: pendingSnap.size };
};

const sweepPendingStakeSettlements = async ({
  adminDb,
  now,
  WIN_MULTIPLIER,
  REFUND_PERCENTAGE,
  REFERRAL_COMMISSION_RATE,
}) => {
  const completedGamesSnap = await adminDb.collection("timed_games")
    .where("status", "==", "completed")
    .orderBy("endTime", "desc")
    .limit(MAX_SWEEP_COMPLETED_GAMES)
    .get();

  let pendingScanned = 0;
  let pendingSettled = 0;
  let pendingEligible = 0;

  for (const gameDoc of completedGamesSnap.docs) {
    const gameData = gameDoc.data() || {};
    const winners = Array.isArray(gameData.winners) ? gameData.winners : [];
    if (winners.length < 2) continue;

    pendingEligible += 1;

    try {
      const result = await settlePendingForGame({
        adminDb,
        gameId: gameDoc.id,
        winningNums: winners,
        now,
        WIN_MULTIPLIER,
        REFUND_PERCENTAGE,
        REFERRAL_COMMISSION_RATE,
      });
      pendingScanned += result.scanned;
      pendingSettled += result.settledCount;
    } catch (error) {
      console.error("Failed pending sweep on completed game", {
        gameId: gameDoc.id,
        error: error?.message || error,
      });
    }
  }

  return { pendingScanned, pendingSettled, pendingEligible };
};

export async function runGameEngine({ includePendingSweep = false } = {}) {
  let adminDb;
  let lockOwnerId = "";
  let lockAcquired = false;

  try {
    adminDb = getAdminDb();
    const rtdb = getRtdb();
    const now = Date.now();
    const WIN_MULTIPLIER = 1.3;
    const REFUND_PERCENTAGE = 0.8;
    const REFERRAL_COMMISSION_RATE = 0.05;

    const gameRef = rtdb.ref("active_game_flyova");
    const roundGuardRef = adminDb.collection(ROUND_GUARD_COLLECTION).doc(ROUND_GUARD_DOC_ID);
    lockOwnerId = `engine_${now}_${Math.random().toString(36).slice(2, 10)}`;

    // Fast path: while the live round is still running there is nothing to do, so
    // answer from one read without taking the lock. Clients poll this every few seconds.
    if (!includePendingSweep) {
      const liveSnap = await withEngineTimeout(
        "Live StraWins round lookup",
        () => adminDb.collection("timed_games").where("status", "==", "active").limit(1).get()
      );
      const liveEnd = Number(liveSnap.docs[0]?.data()?.endTime || 0);
      if (!liveSnap.empty && liveEnd > now) {
        return NextResponse.json({
          message: "Running",
          settledNow: 0,
          stalePendingScanned: 0,
          stalePendingSettled: 0,
          pendingStakeEligible: 0,
          pendingSweepSkipped: true,
        });
      }
    }

    const lockState = await withEngineTimeout(
      "StraWins game engine lock",
      () => acquireEngineLock(adminDb, lockOwnerId)
    );
    if (!lockState.acquired) {
      return NextResponse.json({
        message: "Skipped: game engine already running",
        lockOwner: lockState.ownerId || null,
        lockExpiresAt: lockState.expiresAt || null,
      });
    }
    lockAcquired = true;

    let settledNowCount = 0;

    // 1. SETTLE EXPIRED GAMES
    const activeSnap = await withEngineTimeout(
      "Expired StraWins round lookup",
      () => adminDb.collection("timed_games")
        .where("status", "==", "active")
        .where("endTime", "<=", now)
        .limit(1)
        .get()
    );

    if (!activeSnap.empty) {
      const gameDoc = activeSnap.docs[0];
      const gameId = gameDoc.id;
      const secret = await adminDb.collection(SECRETS_COLLECTION).doc(gameId).get();
      const winningNums = [secret.data()?.winners, gameDoc.data()?.winners].find(Array.isArray) || [];

      const settled = await settlePendingForGame({
        adminDb,
        gameId,
        winningNums,
        now,
        WIN_MULTIPLIER,
        REFUND_PERCENTAGE,
        REFERRAL_COMMISSION_RATE,
      });
      settledNowCount += settled.settledCount;

      await Promise.all([
        gameDoc.ref.update({ status: "completed", completedAt: now, winners: winningNums }),
        gameRef.update({ status: "settled", winners: winningNums }),
        roundGuardRef.set({
          status: "settled",
          gameId,
          endTime: gameDoc.data().endTime,
          updatedAt: now,
        }, { merge: true }),
      ]);
    }

    // Historical sweep is intentionally opt-in. Running it on every player heartbeat
    // can fan out into hundreds of reads before a new round is even created.
    const pendingSweep = includePendingSweep
      ? await sweepPendingStakeSettlements({
          adminDb,
          now,
          WIN_MULTIPLIER,
          REFUND_PERCENTAGE,
          REFERRAL_COMMISSION_RATE,
        })
      : emptyPendingSweep(true);

    // 2. START NEW GAME
    const runningSnap = await withEngineTimeout(
      "Active StraWins round lookup",
      () => adminDb.collection("timed_games")
        .where("status", "==", "active")
        .limit(1)
        .get()
    );

    if (runningSnap.empty) {
      const { startTime, endTime } = getRoundWindow(now);

      const pool = [];
      while (pool.length < 4) {
        const r = Math.floor(Math.random() * 90) + 1;
        if (!pool.includes(r)) pool.push(r);
      }
      const winners = [pool[0], pool[1]].sort((a, b) => a - b);
      const randomizedDisplay = shuffleArray([...pool]);

      const gameDocId = `round_${endTime}`;
      const gameDocRef = adminDb.collection("timed_games").doc(gameDocId);

      const createResult = await adminDb.runTransaction(async (tx) => {
        const liveActiveQ = adminDb.collection("timed_games")
          .where("status", "==", "active")
          .limit(1);
        const liveActiveSnap = await tx.get(liveActiveQ);
        if (!liveActiveSnap.empty) {
          const liveDoc = liveActiveSnap.docs[0];
          const liveData = liveDoc.data() || {};
          return {
            created: false,
            gameId: liveDoc.id,
            numbers: liveData.numbers || [],
            startTime: liveData.startTime || (Number(liveData.endTime || endTime) - ROUND_DURATION_MS),
            endTime: liveData.endTime || endTime,
          };
        }

        const guardSnap = await tx.get(roundGuardRef);
        const guardData = guardSnap.exists ? guardSnap.data() : {};
        const guardedGameId = String(guardData?.gameId || "").trim();
        if (guardedGameId) {
          const guardedRef = adminDb.collection("timed_games").doc(guardedGameId);
          const guardedSnap = await tx.get(guardedRef);
          if (guardedSnap.exists) {
            const guardedData = guardedSnap.data() || {};
            const guardedEndTime = Number(guardedData.endTime || 0);
            const guardedStatus = String(guardedData.status || "");
            if (guardedStatus === "active" && guardedEndTime > now - ENGINE_LOCK_GRACE_MS) {
              return {
                created: false,
                gameId: guardedRef.id,
                numbers: guardedData.numbers || [],
                startTime: guardedData.startTime || (guardedEndTime - ROUND_DURATION_MS),
                endTime: guardedEndTime,
              };
            }
          }
        }

        const existingSnap = await tx.get(gameDocRef);
        let finalNumbers = randomizedDisplay;
        let created = false;

        if (existingSnap.exists) {
          const existingData = existingSnap.data() || {};
          finalNumbers = existingData.numbers || randomizedDisplay;
        } else {
          tx.create(gameDocRef, {
            status: "active",
            startTime,
            endTime,
            roundDuration: ROUND_DURATION_MS,
            numbers: randomizedDisplay,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          tx.create(adminDb.collection(SECRETS_COLLECTION).doc(gameDocId), {
            winners,
            allGenerated: pool,
            endTime,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          created = true;
        }

        tx.set(roundGuardRef, {
          status: "active",
          gameId: gameDocId,
          startTime,
          endTime,
          roundDuration: ROUND_DURATION_MS,
          updatedAt: now,
          lockOwnerId,
        }, { merge: true });

        return {
          created,
          gameId: gameDocId,
          numbers: finalNumbers,
          startTime,
          endTime,
        };
      });

      await gameRef.set({
        gameId: createResult.gameId,
        status: "active",
        startTime: createResult.startTime,
        endTime: createResult.endTime,
        roundDuration: ROUND_DURATION_MS,
        numbers: createResult.numbers,
      });

      return NextResponse.json({
        message: createResult.created ? "Round started" : "Round already active",
        settledNow: settledNowCount,
        stalePendingScanned: pendingSweep.pendingScanned,
        stalePendingSettled: pendingSweep.pendingSettled,
        pendingStakeEligible: pendingSweep.pendingEligible,
        pendingSweepSkipped: pendingSweep.skipped,
      });
    }

    return NextResponse.json({
      message: "Running",
      settledNow: settledNowCount,
      stalePendingScanned: pendingSweep.pendingScanned,
      stalePendingSettled: pendingSweep.pendingSettled,
      pendingStakeEligible: pendingSweep.pendingEligible,
      pendingSweepSkipped: pendingSweep.skipped,
    });
  } catch (err) {
    console.error("StraWins game engine failed:", err);
    return NextResponse.json({
      error: err.message,
      code: err.code || null,
    }, { status: 500 });
  } finally {
    // Release even after a failure: holding the lock after a crash froze the game
    // for the whole TTL, since every later run was told "already running".
    if (adminDb && lockOwnerId && lockAcquired) {
      await releaseEngineLock(adminDb, lockOwnerId).catch(() => {});
    }
  }
}

export async function GET(request) {
  const includePendingSweep = request?.nextUrl?.searchParams?.get("sweep") === "1";
  return runGameEngine({ includePendingSweep });
}
