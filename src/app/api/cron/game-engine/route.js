import { adminDb, admin, getRtdb } from "@/lib/firebaseAdmin";
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
  const rtdb = getRtdb();
  const now = Date.now();
  const WIN_MULTIPLIER = 1.3;
  const REFUND_PERCENTAGE = 0.8; // 80% refund for 1 correct number
  const REFERRAL_COMMISSION_RATE = 0.003; // 0.3%
  let settlementLog = "";
  
  try {
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

      const batch = adminDb.batch();

      for (const betDoc of usersSnap.docs) {
        const betData = betDoc.data();
        const userPicks = betData.picks; 
        const userRef = betDoc.ref.parent.parent; 
        
        const userSnap = await userRef.get();
        const userData = userSnap.data();

        const matches = userPicks.filter(num => winningNums.includes(num)).length;

        if (matches === 2) {
          const payout = betData.amount * WIN_MULTIPLIER;
          batch.update(betDoc.ref, { status: "win", payout: payout, matches: 2 });
          batch.update(userRef, { wallet: admin.firestore.FieldValue.increment(payout) });
        } 
        else if (matches === 1) {
          const refundAmount = betData.amount * REFUND_PERCENTAGE;
          batch.update(betDoc.ref, { status: "refunded", payout: refundAmount, matches: 1 });
          batch.update(userRef, { wallet: admin.firestore.FieldValue.increment(refundAmount) });
        } 
        else {
          batch.update(betDoc.ref, { status: "loss", matches: 0 });

          // REFERRAL LOGIC: Using referrerUid as the primary key
          if (userData?.referrerUid) {
            const referrerRef = adminDb.collection("users").doc(userData.referrerUid);
            const commission = betData.amount * REFERRAL_COMMISSION_RATE;
            
            batch.update(referrerRef, { 
              wallet: admin.firestore.FieldValue.increment(commission) 
            });
            
            const refLogRef = referrerRef.collection("transactions").doc();
            batch.set(refLogRef, {
              title: "Referral Commission (Downline Loss)",
              amount: commission,
              type: "referral",
              status: "win",
              fromUser: userData.username || userData.referredBy || "Player",
              timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        }
      }

      await batch.commit();
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
      const endTime = now + 120000; 

      const randomizedDisplay = shuffleArray([...pool]);

      const newGameRef = await adminDb.collection("timed_games").add({
        status: "active",
        endTime: endTime,
        winners: winners,
        allGenerated: pool,
        displayNumbers: randomizedDisplay, 
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      await gameRef.set({
        gameId: newGameRef.id,
        status: "active",
        endTime: endTime,
        winners: winners,
        displayNumbers: randomizedDisplay 
      });

      return NextResponse.json({ message: settlementLog + "1-90 Game Started" });
    }

    return NextResponse.json({ message: settlementLog || "Running" });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}