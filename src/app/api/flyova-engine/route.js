import { db } from "@/lib/firebase";
import { 
  collection, query, where, getDocs, doc, 
  runTransaction, serverTimestamp, addDoc, increment, limit, orderBy, updateDoc 
} from "firebase/firestore";
import { NextResponse } from "next/server";

export async function GET() {
  const now = Date.now();
  console.log(`--- Engine Run at ${new Date(now).toISOString()} ---`);

  try {
    const WIN_MULTIPLIER = 1.3;
    const REF_COMMISSION = 0.005; 
    const RESULT_DISPLAY_TIME = 30000; // 30 seconds

    // 1. PHASE ONE: Handle Expired Active Games
    const qActive = query(
      collection(db, "timed_games"),
      where("status", "==", "active"),
      where("endTime", "<=", now),
      limit(1)
    );
    
    const activeSnap = await getDocs(qActive);

    if (!activeSnap.empty) {
      const gameDoc = activeSnap.docs[0];
      const gameData = { id: gameDoc.id, ...gameDoc.data() };
      console.log(`Found expired game: ${gameData.id}. Starting payouts...`);

      const usersSnap = await getDocs(collection(db, "users"));
      
      for (const userDoc of usersSnap.docs) {
        const userId = userDoc.id;
        const userData = userDoc.data();
        
        const userBetsQ = query(
          collection(db, "users", userId, "transactions"),
          where("gameId", "==", gameData.id),
          where("status", "==", "pending")
        );
        const userBetsSnap = await getDocs(userBetsQ);

        if (!userBetsSnap.empty) {
          await runTransaction(db, async (transaction) => {
            let totalPayout = 0;
            userBetsSnap.forEach((betDoc) => {
              const bet = betDoc.data();
              const isWinner = JSON.stringify([...(bet.picks || [])].sort()) === 
                               JSON.stringify([...(gameData.winners || [])].sort());

              const transRef = doc(db, "users", userId, "transactions", betDoc.id);
              if (isWinner) {
                const payout = parseFloat((bet.amount * WIN_MULTIPLIER).toFixed(2));
                totalPayout += payout;
                transaction.update(transRef, { status: "win", amount: payout, type: "win" });
              } else {
                transaction.update(transRef, { status: "loss" });
                if (userData.referredBy) {
                  transaction.update(doc(db, "users", userData.referredBy), { 
                    referralBonus: increment(bet.amount * REF_COMMISSION) 
                  });
                }
              }
            });

            if (totalPayout > 0) {
              transaction.update(doc(db, "users", userId), { wallet: increment(totalPayout) });
            }
          });
        }
      }

      await updateDoc(doc(db, "timed_games", gameData.id), { 
        status: "completed", 
        completedAt: now 
      });

      return NextResponse.json({ message: `Processed payouts for ${gameData.id}` });
    }

    // 2. PHASE TWO: Start New Game
    // We check for the most recent completed game
    const qLast = query(
      collection(db, "timed_games"), 
      where("status", "==", "completed"), 
      orderBy("completedAt", "desc"), 
      limit(1)
    );
    const lastSnap = await getDocs(qLast);

    // Check if there is an active game ALREADY running
    const qRunning = query(collection(db, "timed_games"), where("status", "==", "active"), limit(1));
    const runningSnap = await getDocs(qRunning);

    if (!runningSnap.empty) {
        return NextResponse.json({ message: "Game already in progress..." });
    }

    let shouldStartNew = false;
    if (lastSnap.empty) {
      console.log("No previous games found at all. Starting fresh.");
      shouldStartNew = true;
    } else {
      const lastGame = lastSnap.docs[0].data();
      const waitTimeRemaining = (lastGame.completedAt + RESULT_DISPLAY_TIME) - now;
      
      if (waitTimeRemaining <= 0) {
        shouldStartNew = true;
      } else {
        console.log(`Still in result phase. ${Math.round(waitTimeRemaining/1000)}s left.`);
        return NextResponse.json({ message: "Waiting for 30s result display to finish" });
      }
    }

    if (shouldStartNew) {
      const winners = [];
      while(winners.length < 2) {
          const r = Math.floor(Math.random() * 20) + 1;
          if(!winners.includes(r)) winners.push(r);
      }

      const newGame = {
          status: "active",
          startTime: now,
          endTime: now + (120 * 1000), // 2 minutes
          winners: winners,
          createdAt: serverTimestamp()
      };

      await addDoc(collection(db, "timed_games"), newGame);
      return NextResponse.json({ message: "New game started successfully!" });
    }

    return NextResponse.json({ message: "Standby" });
  } catch (err) {
    console.error("ENGINE CRITICAL ERROR:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}