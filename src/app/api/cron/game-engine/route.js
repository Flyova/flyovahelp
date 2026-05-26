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

const ENGINE_LOCK_TTL_MS = 180000; // 3 minutes
const ENGINE_LOCK_GRACE_MS = 5000;
const ENGINE_LOCK_COLLECTION = "system_locks";
const ENGINE_LOCK_DOC_ID = "flyova_game_engine_lock";
const ROUND_GUARD_COLLECTION = "system_state";
const ROUND_GUARD_DOC_ID = "flyova_round_guard";
const MAX_SWEEP_COMPLETED_GAMES = 120;

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

const settleBetDoc = async ({
  adminDb,
  betDoc,
  winningNums,
  now,
  WIN_MULTIPLIER,
  REFUND_PERCENTAGE,
  REFERRAL_COMMISSION_RATE,
}) => {
  return adminDb.runTransaction(async (tx) => {
    const freshBetSnap = await tx.get(betDoc.ref);
    if (!freshBetSnap.exists) return { settled: false, reason: "bet-missing" };

    const freshBet = freshBetSnap.data() || {};
    if (freshBet.status !== "pending") {
      return { settled: false, reason: "already-settled" };
    }

    const userRef = betDoc.ref.parent.parent;
    if (!userRef) return { settled: false, reason: "missing-user-ref" };

    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists ? userSnap.data() : {};

    const referrerUid = typeof userData?.referrerUid === "string" ? userData.referrerUid.trim() : "";
    const referrerRef = referrerUid ? adminDb.collection("users").doc(referrerUid) : null;
    const referrerSnap = referrerRef ? await tx.get(referrerRef) : null;

    const betAmount = Math.abs(Number(freshBet.amount || 0));
    const stakeAmount = Math.abs(Number(freshBet.stakeAmount || betAmount || 0));
    const picks = Array.isArray(freshBet.picks) ? freshBet.picks : [];
    const matches = picks.filter((num) => winningNums.includes(num)).length;

    if (matches === 2) {
      const payout = toMoney(betAmount * WIN_MULTIPLIER);
      tx.update(betDoc.ref, { status: "win", matches: 2, stakeAmount, settledAt: now });
      if (userSnap.exists) {
        tx.update(userRef, { wallet: admin.firestore.FieldValue.increment(payout) });
      }
      return { settled: true, result: "win", amount: payout };
    }

    if (matches === 1) {
      const refundAmount = toMoney(betAmount * REFUND_PERCENTAGE);
      tx.update(betDoc.ref, { status: "partial", matches: 1, stakeAmount, settledAt: now });
      if (userSnap.exists) {
        tx.update(userRef, { wallet: admin.firestore.FieldValue.increment(refundAmount) });
      }
      return { settled: true, result: "partial", amount: refundAmount };
    }

    tx.update(betDoc.ref, { status: "loss", matches: 0, stakeAmount, settledAt: now });

    // Referral credit must never block loss settlement.
    if (referrerRef && referrerSnap?.exists) {
      const commission = toMoney(betAmount * REFERRAL_COMMISSION_RATE);
      if (commission > 0) {
        tx.update(referrerRef, {
          referralBonus: admin.firestore.FieldValue.increment(commission),
        });
      }
    }

    return { settled: true, result: "loss", amount: 0 };
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

  let settledCount = 0;
  for (const betDoc of pendingSnap.docs) {
    const betData = betDoc.data() || {};
    if (betData.type !== "stake") continue;

    try {
      const outcome = await settleBetDoc({
        adminDb,
        betDoc,
        winningNums,
        now,
        WIN_MULTIPLIER,
        REFUND_PERCENTAGE,
        REFERRAL_COMMISSION_RATE,
      });
      if (outcome?.settled) settledCount += 1;
    } catch (error) {
      console.error("Failed to settle pending bet", { gameId, betId: betDoc.id, error: error?.message || error });
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

export async function runGameEngine() {
  let adminDb;
  let lockOwnerId = "";

  try {
    adminDb = getAdminDb();
    const rtdb = getRtdb();
    const now = Date.now();
    const WIN_MULTIPLIER = 1.3;
    const REFUND_PERCENTAGE = 0.8;
    const REFERRAL_COMMISSION_RATE = 0.025;
    const ROUND_DURATION = 120000; // 2 min per round

    const gameRef = rtdb.ref("active_game_flyova");
    const roundGuardRef = adminDb.collection(ROUND_GUARD_COLLECTION).doc(ROUND_GUARD_DOC_ID);
    lockOwnerId = `engine_${now}_${Math.random().toString(36).slice(2, 10)}`;

    const lockState = await acquireEngineLock(adminDb, lockOwnerId);
    if (!lockState.acquired) {
      return NextResponse.json({
        message: "Skipped: game engine already running",
        lockOwner: lockState.ownerId || null,
        lockExpiresAt: lockState.expiresAt || null,
      });
    }

    let settledNowCount = 0;

    // 1. SETTLE EXPIRED GAMES
    const activeSnap = await adminDb.collection("timed_games")
      .where("status", "==", "active")
      .where("endTime", "<=", now)
      .limit(1)
      .get();

    if (!activeSnap.empty) {
      const gameDoc = activeSnap.docs[0];
      const gameId = gameDoc.id;
      const winningNums = Array.isArray(gameDoc.data()?.winners) ? gameDoc.data().winners : [];

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

      await gameDoc.ref.update({ status: "completed", completedAt: now });
      await gameRef.update({ status: "settled", winners: winningNums });
      await roundGuardRef.set({
        status: "settled",
        gameId,
        endTime: gameDoc.data().endTime,
        updatedAt: now,
      }, { merge: true });
    }

    // 1b. Sweep remaining pending stake records. This covers offline users whose
    // stake rows were missed by previous engine runs and unlocks referral loss credit.
    const pendingSweep = await sweepPendingStakeSettlements({
      adminDb,
      now,
      WIN_MULTIPLIER,
      REFUND_PERCENTAGE,
      REFERRAL_COMMISSION_RATE,
    });

    // 2. START NEW GAME
    const runningSnap = await adminDb.collection("timed_games")
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (runningSnap.empty) {
      const lastEndTime = activeSnap.empty ? null : activeSnap.docs[0]?.data()?.endTime;
      const endTime = lastEndTime ? lastEndTime + ROUND_DURATION : now + ROUND_DURATION;

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
            winners: liveData.winners || [],
            numbers: liveData.numbers || [],
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
                winners: guardedData.winners || [],
                numbers: guardedData.numbers || [],
                endTime: guardedEndTime,
              };
            }
          }
        }

        const existingSnap = await tx.get(gameDocRef);
        let finalWinners = winners;
        let finalNumbers = randomizedDisplay;
        let created = false;

        if (existingSnap.exists) {
          const existingData = existingSnap.data() || {};
          finalWinners = existingData.winners || winners;
          finalNumbers = existingData.numbers || randomizedDisplay;
        } else {
          tx.create(gameDocRef, {
            status: "active",
            endTime,
            winners,
            allGenerated: pool,
            numbers: randomizedDisplay,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          created = true;
        }

        tx.set(roundGuardRef, {
          status: "active",
          gameId: gameDocId,
          endTime,
          updatedAt: now,
          lockOwnerId,
        }, { merge: true });

        return {
          created,
          gameId: gameDocId,
          winners: finalWinners,
          numbers: finalNumbers,
          endTime,
        };
      });

      await gameRef.set({
        gameId: createResult.gameId,
        status: "active",
        endTime: createResult.endTime,
        winners: createResult.winners,
        numbers: createResult.numbers,
      });

      return NextResponse.json({
        message: createResult.created ? "Round started" : "Round already active",
        settledNow: settledNowCount,
        stalePendingScanned: pendingSweep.pendingScanned,
        stalePendingSettled: pendingSweep.pendingSettled,
        pendingStakeEligible: pendingSweep.pendingEligible,
      });
    }

    return NextResponse.json({
      message: "Running",
      settledNow: settledNowCount,
      stalePendingScanned: pendingSweep.pendingScanned,
      stalePendingSettled: pendingSweep.pendingSettled,
      pendingStakeEligible: pendingSweep.pendingEligible,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (adminDb && lockOwnerId) {
      await releaseEngineLock(adminDb, lockOwnerId).catch(() => {});
    }
  }
}

export async function GET() {
  return runGameEngine();
}
