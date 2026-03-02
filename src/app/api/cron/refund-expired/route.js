import { NextResponse } from "next/navigation";
import { db } from "@/lib/firebase";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  runTransaction, 
  limit,
  serverTimestamp,
  addDoc
} from "firebase/firestore";

export async function GET(request) {
  // 1. Basic Security Check (Optional: check for QStash secret header)
  const authHeader = request.headers.get('authorization');
  if (process.env.NODE_ENV === "production" && !authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 2. Query for expired trades (Limit to 50 to save quota)
    const tradesRef = collection(db, "trades");
    const q = query(
      tradesRef, 
      where("status", "==", "cancelled"), 
      where("reason", "==", "Expired"),
      limit(50) 
    );

    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return NextResponse.json({ message: "No expired trades found." });
    }

    const results = { processed: 0, failed: 0 };

    // 3. Process each trade in a Transaction
    const promises = querySnapshot.docs.map(async (tradeDoc) => {
      const tradeData = tradeDoc.data();
      const tradeId = tradeDoc.id;
      const userId = tradeData.senderId;
      const refundAmount = tradeData.amount + (tradeData.fee || 0);

      const userRef = doc(db, "users", userId);
      const tradeDocRef = doc(db, "trades", tradeId);

      try {
        await runTransaction(db, async (transaction) => {
          const userSnap = await transaction.get(userRef);
          if (!userSnap.exists()) throw "User does not exist";

          // Add money back to user wallet
          transaction.update(userRef, {
            wallet: (userSnap.data().wallet || 0) + refundAmount
          });

          // Change status so it's not picked up by next cron run
          transaction.update(tradeDocRef, {
            status: "refunded",
            refundedAt: serverTimestamp()
          });

          // Log the transaction for the user's history
          const logRef = doc(collection(db, "users", userId, "transactions"));
          transaction.set(logRef, {
            title: "Trade Refund",
            amount: refundAmount,
            type: "finance",
            status: "win",
            tradeId: tradeId,
            timestamp: serverTimestamp()
          });
        });
        results.processed++;
      } catch (err) {
        console.error(`Refund failed for trade ${tradeId}:`, err);
        results.failed++;
      }
    });

    await Promise.all(promises);

    return NextResponse.json({ 
      message: "Cron completed", 
      stats: results 
    });

  } catch (error) {
    console.error("Cron Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}