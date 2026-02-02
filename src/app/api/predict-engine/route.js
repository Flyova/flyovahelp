import { adminDb, admin } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = Date.now();
  const ROUND_DURATION = 60000; 
  const WIN_REWARD = 0.20;

  try {
    console.log("Predict Engine: Starting execution...");

    // 1. CLEAN UP ALL EXPIRED/STUCK GAMES
    // We look for any game that is 'active' but its endTime has passed.
    const expiredSnap = await adminDb.collection("predict_games")
      .where("status", "==", "active")
      .where("endTime", "<=", now)
      .get();

    if (!expiredSnap.empty) {
      console.log(`Found ${expiredSnap.size} expired games. Processing...`);
      
      for (const gameDoc of expiredSnap.docs) {
        const gameData = { id: gameDoc.id, ...gameDoc.data() };
        
        // Payout Logic
        const sum = (gameData.n1 || 0) + (gameData.n2 || 0);
        const actualCondition = sum % 2 === 0 ? "Even" : "Odd";

        const usersSnap = await adminDb.collection("users").get();
        for (const userDoc of usersSnap.docs) {
          const userId = userDoc.id;
          const predictionsSnap = await adminDb.collection("users").doc(userId)
            .collection("transactions")
            .where("gameId", "==", gameData.id)
            .where("status", "==", "pending")
            .get();

          if (!predictionsSnap.empty) {
            await adminDb.runTransaction(async (transaction) => {
              predictionsSnap.forEach((predDoc) => {
                const pred = predDoc.data();
                const isWinner = pred.prediction === actualCondition || pred.prediction === "Both";
                const transRef = adminDb.collection("users").doc(userId).collection("transactions").doc(predDoc.id);

                if (isWinner) {
                  transaction.update(transRef, { status: "win", amount: WIN_REWARD, title: "Predict Win" });
                  transaction.update(adminDb.collection("users").doc(userId), {
                    wallet: admin.firestore.FieldValue.increment(WIN_REWARD)
                  });
                } else {
                  transaction.update(transRef, { status: "loss" });
                }
              });
            });
          }
        }
        // Mark this specific game as completed
        await adminDb.collection("predict_games").doc(gameData.id).update({ 
          status: "completed",
          completedAt: now 
        });
      }
    }

    // 2. CHECK IF WE NEED A NEW GAME
    // After cleaning up, see if there's still an active game
    const activeCheck = await adminDb.collection("predict_games")
      .where("status", "==", "active")
      .limit(1).get();

    if (activeCheck.empty) {
      console.log("No active game found. Starting new round...");
      const n1 = Math.floor(Math.random() * 50) + 1;
      const n2 = Math.floor(Math.random() * 50) + 1;
      const nextSum = n1 + n2;
      const nextCondition = nextSum % 2 === 0 ? "Even" : "Odd";

      await adminDb.collection("predict_games").add({
        condition: nextCondition,
        n1: n1,
        n2: n2,
        endTime: now + ROUND_DURATION,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "active"
      });

      return NextResponse.json({ 
        status: "success", 
        message: "Old games processed and New Round Started" 
      });
    }

    console.log("Current game is still valid and running.");
    return NextResponse.json({ 
      status: "running", 
      message: "Game currently running" 
    });

  } catch (err) {
    console.error("CRITICAL ENGINE ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}