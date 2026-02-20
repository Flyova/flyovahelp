import { adminDb, admin, rtdb } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET() {
  const now = Date.now();
  
  try {
    const WIN_MULTIPLIER = 1.3;
    const REFUND_MULTIPLIER = 0.8; 
    const RESULT_DISPLAY_TIME = 10000; 

    // --- PHASE 1: SETTLE EXPIRED GAMES ---
    const activeSnap = await adminDb.collection("timed_games")
      .where("status", "==", "active")
      .where("endTime", "<=", now)
      .limit(1).get();

    if (!activeSnap.empty) {
      const gameDoc = activeSnap.docs[0];
      const gameData = { id: gameDoc.id, ...gameDoc.data() };
      const winners = gameData.winners || [];

      // Only fetch bets for THIS game to save quota
      const pendingBetsSnap = await adminDb.collectionGroup("transactions")
        .where("gameId", "==", gameData.id)
        .where("status", "==", "pending")
        .get();

      const batch = adminDb.batch();
      const walletUpdates = new Map();

      pendingBetsSnap.forEach((betDoc) => {
        const bet = betDoc.data();
        const userPicks = bet.picks || [];
        const matchCount = userPicks.filter(num => winners.includes(num)).length;
        
        let payout = 0;
        let status = "loss";

        if (matchCount === 2) {
          payout = parseFloat((bet.amount * WIN_MULTIPLIER).toFixed(2));
          status = "win";
        } else if (matchCount === 1) {
          payout = parseFloat((bet.amount * REFUND_MULTIPLIER).toFixed(2));
          status = "partial";
        }

        batch.update(betDoc.ref, { status, amount: payout, settledAt: now });
        
        if (payout > 0) {
          // Path: users/{uid}/transactions/{betId} -> parent.parent gets the UID
          const uid = betDoc.ref.parent.parent.id;
          walletUpdates.set(uid, (walletUpdates.get(uid) || 0) + payout);
        }
      });

      // Apply wallet increases
      walletUpdates.forEach((amount, uid) => {
        batch.update(adminDb.collection("users").doc(uid), { 
          wallet: admin.firestore.FieldValue.increment(amount) 
        });
      });

      batch.update(gameDoc.ref, { status: "completed", completedAt: now });
      await batch.commit();

      // BROADCAST SETTLEMENT: Tell RTD the game is over
      await rtdb.ref("active_game_flyova").update({
        status: "settled",
        winners: winners,
        lastGameId: gameData.id,
        timestamp: now
      });
    }

    // --- PHASE 2: START NEW GAME ---
    const runningSnap = await adminDb.collection("timed_games")
      .where("status", "==", "active").limit(1).get();

    if (runningSnap.empty) {
      const lastSnap = await adminDb.collection("timed_games")
        .where("status", "==", "completed")
        .orderBy("completedAt", "desc").limit(1).get();

      let ready = true;
      if (!lastSnap.empty) {
        if (now - lastSnap.docs[0].data().completedAt < RESULT_DISPLAY_TIME) ready = false;
      }

      if (ready) {
        // Generate 5 random numbers (1-4 as requested)
        const numbers = [];
        while (numbers.length < 5) {
          const r = Math.floor(Math.random() * 4) + 1;
          if (!numbers.includes(r)) numbers.push(r);
        }
        const winners = [numbers[0], numbers[1]];
        const endTime = now + (120 * 1000);

        // Save to Firestore (Permanent History)
        const newGameRef = await adminDb.collection("timed_games").add({
          status: "active",
          startTime: now,
          endTime: endTime,
          winners: winners,
          numbers: numbers,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Broadcast to RTD (Live Display)
        await rtdb.ref("active_game_flyova").set({
          gameId: newGameRef.id,
          status: "active",
          endTime: endTime,
          numbers: numbers,
          winners: winners,
          timestamp: now
        });

        return NextResponse.json({ message: "Game broadcasted" });
      }
    }

    return NextResponse.json({ message: "Waiting" });

  } catch (err) {
    console.error("Critical Engine Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}