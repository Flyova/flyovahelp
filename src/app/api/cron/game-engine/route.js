import { adminDb, admin, getRtdb } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";

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

      // PAYOUT LOGIC: Find all users who bet on this game
      const usersSnap = await adminDb.collectionGroup("transactions")
        .where("gameId", "==", gameId)
        .where("status", "==", "pending")
        .get();

      const batch = adminDb.batch();

      usersSnap.forEach((betDoc) => {
        const betData = betDoc.data();
        const userPicks = betData.picks.sort((a, b) => a - b);
        
        // Check if user picks match winners exactly
        const isWinner = JSON.stringify(userPicks) === JSON.stringify(winningNums);

        if (isWinner) {
          const payout = betData.amount * WIN_MULTIPLIER;
          // 1. Update Transaction to win
          batch.update(betDoc.ref, { status: "win", payout: payout });
          // 2. Credit the User Wallet (BetDoc is inside user subcollection)
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

    // 2. START NEW GAME (Your existing logic)
    const runningSnap = await adminDb.collection("timed_games")
      .where("status", "==", "active").limit(1).get();

    if (runningSnap.empty) {
      const pool = [];
      while (pool.length < 4) {
        const r = Math.floor(Math.random() * 90) + 1;
        if (!pool.includes(r)) pool.push(r);
      }
      
      const winners = [pool[0], pool[1]].sort((a,b) => a-b);
      const endTime = now + 120000; 

      const newGameRef = await adminDb.collection("timed_games").add({
        status: "active",
        endTime: endTime,
        winners: winners,
        allGenerated: pool,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      await gameRef.set({
        gameId: newGameRef.id,
        status: "active",
        endTime: endTime,
        winners: winners,
        displayNumbers: pool 
      });

      return NextResponse.json({ message: "1-90 Game Started" });
    }

    return NextResponse.json({ message: "Running" });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}