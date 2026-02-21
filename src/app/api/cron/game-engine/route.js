import { adminDb, admin, getRtdb } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";

// Fisher-Yates Shuffle Algorithm for true randomization
const shuffleArray = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

export async function GET() {
  const rtdb = getRtdb();
  const now = Date.now();
  const WIN_MULTIPLIER = 1.3;
  
  try {
    const gameRef = rtdb.ref("active_game_flyova");

    // 1. SETTLE EXPIRED GAMES & PAY OUT WINNERS
    const activeSnap = await adminDb.collection("timed_games")
      .where("status", "==", "active")
      .where("endTime", "<=", now).limit(1).get();

    if (!activeSnap.empty) {
      const gameDoc = activeSnap.docs[0];
      const gameId = gameDoc.id;
      const winningNums = gameDoc.data().winners.sort((a, b) => a - b);

      const usersSnap = await adminDb.collectionGroup("transactions")
        .where("gameId", "==", gameId)
        .where("status", "==", "pending")
        .get();

      const batch = adminDb.batch();

      usersSnap.forEach((betDoc) => {
        const betData = betDoc.data();
        const userPicks = betData.picks.sort((a, b) => a - b);
        const isWinner = JSON.stringify(userPicks) === JSON.stringify(winningNums);

        if (isWinner) {
          const payout = betData.amount * WIN_MULTIPLIER;
          batch.update(betDoc.ref, { status: "win", payout: payout });
          const userRef = betDoc.ref.parent.parent; 
          batch.update(userRef, { wallet: admin.firestore.FieldValue.increment(payout) });
        } else {
          batch.update(betDoc.ref, { status: "loss" });
        }
      });

      await batch.commit();
      await gameDoc.ref.update({ status: "completed", completedAt: now });
      await gameRef.update({ status: "settled", winners: winningNums });
      
      return NextResponse.json({ message: "Game Settled and Paid Out" });
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
      
      // Store the winners (first two generated)
      const winners = [pool[0], pool[1]].sort((a,b) => a-b);
      const endTime = now + 120000; 

      // NEW: Randomize the display positions of the winners and losers
      const randomizedDisplay = shuffleArray([...pool]);

      const newGameRef = await adminDb.collection("timed_games").add({
        status: "active",
        endTime: endTime,
        winners: winners,
        allGenerated: pool,
        displayNumbers: randomizedDisplay, // Saved to Firestore
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      await gameRef.set({
        gameId: newGameRef.id,
        status: "active",
        endTime: endTime,
        winners: winners,
        displayNumbers: randomizedDisplay // Pushed to RTDB for the frontend
      });

      return NextResponse.json({ message: "1-90 Game Started" });
    }

    return NextResponse.json({ message: "Running" });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}