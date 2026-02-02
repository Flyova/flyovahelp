import { adminDb, admin } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";

export async function GET() {
  const now = Date.now();
  
  try {
    const WIN_MULTIPLIER = 1.3;
    const REF_COMMISSION = 0.005; // 0.5% referral bonus
    const RESULT_DISPLAY_TIME = 30000; // 30 seconds

    // --- PHASE 1: PAYOUT EXPIRED GAMES ---
    const activeSnap = await adminDb.collection("timed_games")
      .where("status", "==", "active")
      .where("endTime", "<=", now)
      .limit(1).get();

    if (!activeSnap.empty) {
      const gameDoc = activeSnap.docs[0];
      const gameData = { id: gameDoc.id, ...gameDoc.data() };
      const winners = gameData.winners || [];

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
              const sortedPicks = [...(bet.picks || [])].sort((a, b) => a - b);
              const sortedWinners = [...winners].sort((a, b) => a - b);
              
              const isWinner = JSON.stringify(sortedPicks) === JSON.stringify(sortedWinners);

              const transRef = adminDb.collection("users").doc(userId).collection("transactions").doc(betDoc.id);

              if (isWinner) {
                const payout = parseFloat((bet.amount * WIN_MULTIPLIER).toFixed(2));
                totalPayout += payout;
                transaction.update(transRef, { status: "win", amount: payout });
              } else {
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

      return NextResponse.json({ message: "Payouts processed successfully" });
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
        // --- FIXED GENERATION LOGIC: BACK TO 5 NUMBERS TOTAL ---
        const totalPossibleNumbers = [];
        while (totalPossibleNumbers.length < 5) {
          const r = Math.floor(Math.random() * 50) + 1; // Range 1-50 like original
          if (!totalPossibleNumbers.includes(r)) totalPossibleNumbers.push(r);
        }

        // Pick 2 winners from those 5 generated numbers
        const winners = [totalPossibleNumbers[0], totalPossibleNumbers[1]];
        
        // Shuffle the 5 numbers so the winners aren't always at the start of the UI list
        const shuffledGrid = [...totalPossibleNumbers].sort(() => Math.random() - 0.5);

        await adminDb.collection("timed_games").add({
          status: "active",
          startTime: now,
          endTime: now + (120 * 1000), // 2 minutes
          winners: winners, 
          numbers: shuffledGrid, // Only 5 numbers show in the grid now
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return NextResponse.json({ message: "New game started with 5 numbers" });
      }
    }

    return NextResponse.json({ message: "In Result Phase or Game Running..." });

  } catch (err) {
    console.error("ADMIN ENGINE ERROR:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}