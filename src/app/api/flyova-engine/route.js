import { db } from "@/lib/firebase";
import { 
  collection, query, where, getDocs, orderBy, limit, 
  doc, runTransaction, serverTimestamp, addDoc, increment 
} from "firebase/firestore";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const now = Date.now();
    const WIN_MULTIPLIER = 1.3;
    const GAME_DURATION = 120; // 2 minutes

    // 1. Find the active game that needs processing
    const qActive = query(
      collection(db, "timed_games"),
      where("status", "==", "active"),
      where("endTime", "<=", now),
      limit(1)
    );
    const activeSnap = await getDocs(qActive);

    if (!activeSnap.empty) {
      const currentGame = { id: activeSnap.docs[0].id, ...activeSnap.docs[0].data() };
      const winners = currentGame.winners || [];

      // 2. Process Payouts for this game
      const betQ = query(
        collection(db, "users"), // We need to check all users for pending bets on this gameId
        // Note: For large scale, you'd store bets in a root 'bets' collection 
        // but keeping your current sub-collection structure logic:
      );
      
      // We'll update the game status first to prevent double processing
      await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, "timed_games", currentGame.id);
        transaction.update(gameRef, { status: "processing", processedAt: serverTimestamp() });
      });

      // Logic: In a real server environment, you'd iterate through users who have pending 'stake'
      // transactions for this gameId. (Simplified for this script):
      // [Your existing payout logic from page.js would move here inside a server loop]
      
      // Mark as completed
      await runTransaction(db, async (transaction) => {
        transaction.update(doc(db, "timed_games", currentGame.id), { 
            status: "completed", 
            processed: true 
        });
      });
    }

    // 3. Check if a new game needs to be started
    const qNext = query(collection(db, "timed_games"), where("status", "==", "active"), limit(1));
    const nextSnap = await getDocs(qNext);

    if (nextSnap.empty) {
      const numbers = [];
      while (numbers.length < 5) {
        const r = Math.floor(Math.random() * 50) + 1;
        if (!numbers.includes(r)) numbers.push(r);
      }
      const roundWinners = [numbers[0], numbers[1]];
      const shuffled = [...numbers].sort(() => Math.random() - 0.5);

      await addDoc(collection(db, "timed_games"), {
        numbers: shuffled,
        winners: roundWinners,
        endTime: Date.now() + (GAME_DURATION * 1000),
        status: "active",
        processed: false,
        createdAt: serverTimestamp()
      });
    }

    return NextResponse.json({ success: true, message: "Engine sync complete" });
  } catch (error) {
    console.error("Engine Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}