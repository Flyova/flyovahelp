import { adminDb, admin } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";

export async function GET() {
  const now = Date.now();
  
  try {
    const WIN_MULTIPLIER = 1.3;
    const REFUND_MULTIPLIER = 0.8; // 80% refund for 1 correct number
    const REF_COMMISSION = 0.005; 
    const RESULT_DISPLAY_TIME = 10000; 

    // --- PHASE 1: PAYOUT EXPIRED GAMES ---
    const activeSnap = await adminDb.collection("timed_games")
      .where("status", "==", "active")
      .where("endTime", "<=", now)
      .limit(1).get();

    if (!activeSnap.empty) {
      const gameDoc = activeSnap.docs[0];
      const gameData = { id: gameDoc.id, ...gameDoc.data() };
      const winners = gameData.winners || []; // These are the 2 winning numbers

      const usersSnap = await adminDb.collection("users").get();
      
      for (const userDoc of usersSnap.docs) {
        const userId = userDoc.id;
        const userData = userDoc.data();
        
        const betsSnap = await adminDb.collection("users").doc(userId)
          .collection("transactions")
          .where("gameId", "==", gameData.id)
          .where("status", "==", "pending")
          .where("type", "==", "stake").get();

        if (!betsSnap.empty) {
          await adminDb.runTransaction(async (transaction) => {
            let totalPayout = 0;

            betsSnap.forEach((betDoc) => {
              const bet = betDoc.data();
              const userPicks = bet.picks || [];
              
              // Count how many numbers match the winners
              const matchCount = userPicks.filter(num => winners.includes(num)).length;
              
              const transRef = adminDb.collection("users").doc(userId).collection("transactions").doc(betDoc.id);

              if (matchCount === 2) {
                // WON BOTH: 1.3x Payout
                const payout = parseFloat((bet.amount * WIN_MULTIPLIER).toFixed(2));
                totalPayout += payout;
                transaction.update(transRef, { status: "win", amount: payout });
              } 
              else if (matchCount === 1) {
                // PARTIAL: 80% Refund
                const refundAmount = parseFloat((bet.amount * REFUND_MULTIPLIER).toFixed(2));
                totalPayout += refundAmount;
                transaction.update(transRef, { status: "partial", amount: refundAmount, note: "1/2 Correct Match" });
              } 
              else {
                // LOSS: 0 Correct
                transaction.update(transRef, { status: "loss" });
                if (userData.referredBy) {
                  const commission = parseFloat((bet.amount * REF_COMMISSION).toFixed(4));
                  const referrerRef = adminDb.collection("users").doc(userData.referredBy);
                  transaction.update(referrerRef, { 
                    referralBonus: admin.firestore.FieldValue.increment(commission) 
                  });
                }
              }
            });

            if (totalPayout > 0) {
              const userRef = adminDb.collection("users").doc(userId);
              transaction.update(userRef, { 
                wallet: admin.firestore.FieldValue.increment(totalPayout) 
              });
            }
          });
        }
      }

      await adminDb.collection("timed_games").doc(gameData.id).update({ 
        status: "completed", 
        completedAt: now 
      });
    }

    // --- PHASE 2: GENERATE NEW GAME ---
    const runningSnap = await adminDb.collection("timed_games")
      .where("status", "==", "active")
      .limit(1).get();

    if (runningSnap.empty) {
      const lastSnap = await adminDb.collection("timed_games")
        .where("status", "==", "completed")
        .orderBy("completedAt", "desc")
        .limit(1).get();

      let ready = true;
      if (!lastSnap.empty) {
        const lastGame = lastSnap.docs[0].data();
        if (now - lastGame.completedAt < RESULT_DISPLAY_TIME) {
          ready = false;
        }
      }

      if (ready) {
        const totalPossibleNumbers = [];
        while (totalPossibleNumbers.length < 5) {
          const r = Math.floor(Math.random() * 50) + 1;
          if (!totalPossibleNumbers.includes(r)) totalPossibleNumbers.push(r);
        }

        const winners = [totalPossibleNumbers[0], totalPossibleNumbers[1]];
        const shuffledGrid = [...totalPossibleNumbers].sort(() => Math.random() - 0.5);

        await adminDb.collection("timed_games").add({
          status: "active",
          startTime: now,
          endTime: now + (120 * 1000), 
          winners: winners, 
          numbers: shuffledGrid,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return NextResponse.json({ message: "New game started successfully" });
      }
    }

    return NextResponse.json({ message: "Waiting for next 10s check..." });

  } catch (err) {
    console.error("ADMIN ENGINE ERROR:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}