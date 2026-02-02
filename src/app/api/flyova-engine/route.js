import { db } from "@/lib/firebase";
import { 
  collection, query, where, getDocs, doc, 
  runTransaction, serverTimestamp, addDoc, increment, limit, orderBy, updateDoc 
} from "firebase/firestore";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const WIN_MULTIPLIER = 1.3;
    const REF_COMMISSION = 0.005; // 0.5% referral bonus on losses
    const RESULT_DISPLAY_TIME = 30000; // 30 seconds in milliseconds

    // 1. PHASE ONE: Find and Payout Expired Active Games
    const qActive = query(
      collection(db, "timed_games"),
      where("status", "==", "active"),
      where("endTime", "<=", Date.now()),
      limit(1)
    );
    const activeSnap = await getDocs(qActive);

    if (!activeSnap.empty) {
      const gameDoc = activeSnap.docs[0];
      const gameData = { id: gameDoc.id, ...gameDoc.data() };
      const winners = gameData.winners || [];

      // Loop through users to find their bets for this specific game
      const usersSnap = await getDocs(collection(db, "users"));
      
      for (const userDoc of usersSnap.docs) {
        const userId = userDoc.id;
        const userData = userDoc.data();
        
        // Find "pending" stakes for this specific gameId under this user
        const userBetsQ = query(
          collection(db, "users", userId, "transactions"),
          where("gameId", "==", gameData.id),
          where("status", "==", "pending"),
          where("type", "==", "stake")
        );
        const userBetsSnap = await getDocs(userBetsQ);

        if (!userBetsSnap.empty) {
          await runTransaction(db, async (transaction) => {
            let totalPayout = 0;

            for (const betDoc of userBetsSnap.docs) {
              const bet = betDoc.data();
              
              // Sort both to ensure [2, 5] matches [5, 2]
              const sortedPicks = [...(bet.picks || [])].sort((a, b) => a - b);
              const sortedWinners = [...winners].sort((a, b) => a - b);
              const isWinner = sortedPicks.length === sortedWinners.length && 
                               sortedPicks.every((val, index) => val === sortedWinners[index]);

              const transRef = doc(db, "users", userId, "transactions", betDoc.id);

              if (isWinner) {
                const payout = parseFloat((bet.amount * WIN_MULTIPLIER).toFixed(2));
                totalPayout += payout;
                transaction.update(transRef, { status: "win", amount: payout, type: "win" });
              } else {
                transaction.update(transRef, { status: "loss" });

                // Pay referral commission to the person who invited them
                if (userData.referredBy) {
                  const commission = parseFloat((bet.amount * REF_COMMISSION).toFixed(4));
                  const referrerRef = doc(db, "users", userData.referredBy);
                  transaction.update(referrerRef, { 
                    referralBonus: increment(commission) 
                  });
                }
              }
            }

            if (totalPayout > 0) {
              const userRef = doc(db, "users", userId);
              transaction.update(userRef, { wallet: increment(totalPayout) });
            }
          });
        }
      }

      // Mark game as completed and record completion time to start the 30s display clock
      await updateDoc(doc(db, "timed_games", gameData.id), { 
        status: "completed", 
        processed: true,
        completedAt: Date.now() 
      });

      return NextResponse.json({ message: "Game rewarded and moved to results phase" });
    }

    // 2. PHASE TWO: Check if it's time to start a NEW round
    const qLast = query(
      collection(db, "timed_games"), 
      where("status", "==", "completed"), 
      orderBy("completedAt", "desc"), 
      limit(1)
    );
    const lastSnap = await getDocs(qLast);

    if (!lastSnap.empty) {
      const lastGame = lastSnap.docs[0].data();
      const timeSinceCompletion = Date.now() - lastGame.completedAt;

      // Check if an active game already exists
      const qCheckActive = query(collection(db, "timed_games"), where("status", "==", "active"), limit(1));
      const activeCheck = await getDocs(qCheckActive);

      // Start new game ONLY if 30 seconds has passed since the last one ended
      if (activeCheck.empty && timeSinceCompletion >= RESULT_DISPLAY_TIME) {
        const newGameId = `game_${Math.floor(Date.now() / 1000)}`;
        
        // Generate 2 random winning numbers (1-20)
        const winners = [];
        while(winners.length < 2) {
            const r = Math.floor(Math.random() * 20) + 1;
            if(!winners.includes(r)) winners.push(r);
        }

        await addDoc(collection(db, "timed_games"), {
            gameId: newGameId,
            status: "active",
            startTime: Date.now(),
            endTime: Date.now() + (120 * 1000), // 2 Minute duration
            winners: winners,
            createdAt: serverTimestamp()
        });

        return NextResponse.json({ message: "New game started" });
      }
    }

    return NextResponse.json({ message: "No action needed (Game in progress or result phase)" });
  } catch (err) {
    console.error("Engine Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}