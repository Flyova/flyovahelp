import { getAdminDb, admin, getRtdb } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";

// Fisher-Yates Shuffle Algorithm for true randomization
const shuffleArray = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export async function GET() {
  try {
    const adminDb = getAdminDb();
    const rtdb = getRtdb();
    const now = Date.now();
    const WIN_MULTIPLIER = 1.3;
    const REFUND_PERCENTAGE = 0.8; // 80% refund for 1 correct number
    const REFERRAL_COMMISSION_RATE = 0.025; // 2.5%
    let settlementLog = "";

    const gameRef = rtdb.ref("active_game_flyova");

    // 1. SETTLE EXPIRED GAMES & PAY OUT WINNERS
    const activeSnap = await adminDb.collection("timed_games")
      .where("status", "==", "active")
      .where("endTime", "<=", now).limit(1).get();

    if (!activeSnap.empty) {
      const gameDoc = activeSnap.docs[0];
      const gameId = gameDoc.id;
      const winningNums = gameDoc.data().winners; 

      const usersSnap = await adminDb.collectionGroup("transactions")
        .where("gameId", "==", gameId)
        .where("status", "==", "pending")
        .get();

      for (const betDoc of usersSnap.docs) {
        const betData = betDoc.data();
        const userPicks = betData.picks;
        const userRef = betDoc.ref.parent.parent;
        const matches = userPicks.filter(num => winningNums.includes(num)).length;

        // Atomic check-and-settle: if the client already processed this bet, skip it
        await adminDb.runTransaction(async (tx) => {
          const freshBet = await tx.get(betDoc.ref);
          if (freshBet.data()?.status !== "pending") return;

          if (matches === 2) {
            const payout = parseFloat((betData.amount * WIN_MULTIPLIER).toFixed(2));
            tx.update(betDoc.ref, { title: "Flyova Win", amount: payout, type: "win", status: "win", matches: 2 });
            tx.update(userRef, { wallet: admin.firestore.FieldValue.increment(payout) });
          } else if (matches === 1) {
            const refundAmount = parseFloat((betData.amount * REFUND_PERCENTAGE).toFixed(2));
            tx.update(betDoc.ref, { title: "Flyova Partial Refund", amount: refundAmount, type: "win", status: "partial", matches: 1 });
            tx.update(userRef, { wallet: admin.firestore.FieldValue.increment(refundAmount) });
          } else {
            tx.update(betDoc.ref, { status: "loss", matches: 0 });

            const userSnap = await tx.get(userRef);
            const userData = userSnap.data();
            if (userData?.referrerUid) {
              const referrerRef = adminDb.collection("users").doc(userData.referrerUid);
              const commission = parseFloat((betData.amount * REFERRAL_COMMISSION_RATE).toFixed(2));
              tx.update(referrerRef, { referralBonus: admin.firestore.FieldValue.increment(commission) });
            }
          }
        }).catch(console.error);
      }

      await gameDoc.ref.update({ status: "completed", completedAt: now });
      await gameRef.update({ status: "settled", winners: winningNums });
      
      settlementLog = "Game Settled. ";
    }

    // 2. START NEW GAME
    const runningSnap = await adminDb.collection("timed_games")
      .where("status", "==", "active").limit(1).get();

    if (runningSnap.empty) {
      const pool = [];
      while (pool.length < 4) {
        const r = Math.floor(Math.random() * 90) + 1;
        if (!pool.includes(r)) pool.push(r);
      }
      
      const winners = [pool[0], pool[1]].sort((a,b) => a-b);
      // Chain from the settled game's endTime so rounds stay exactly 120s apart
      const lastEndTime = activeSnap.empty ? null : activeSnap.docs[0]?.data()?.endTime;
      const endTime = lastEndTime ? lastEndTime + 120000 : now + 120000;

      const randomizedDisplay = shuffleArray([...pool]);

      const newGameRef = await adminDb.collection("timed_games").add({
        status: "active",
        endTime: endTime,
        winners: winners,
        allGenerated: pool,
        numbers: randomizedDisplay, 
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      await gameRef.set({
        gameId: newGameRef.id,
        status: "active",
        endTime: endTime,
        winners: winners,
        numbers: randomizedDisplay 
      });

      return NextResponse.json({ message: settlementLog + "1-90 Game Started" });
    }

    return NextResponse.json({ message: settlementLog || "Running" });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
