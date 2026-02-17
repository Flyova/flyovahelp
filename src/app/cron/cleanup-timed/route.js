import { adminDb } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // 1. Define the "Cut-off" time (1 hour ago)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);

    // 2. Query for completed games older than 1 hour
    const oldTimedGamesQuery = await adminDb.collection("timed_games")
      .where("status", "==", "completed")
      .where("completedAt", "<", oneHourAgo)
      .limit(500) 
      .get();

    if (oldTimedGamesQuery.empty) {
      return NextResponse.json({ message: "Timed games archive is already clean." });
    }

    // 3. Batch Delete
    const batch = adminDb.batch();
    oldTimedGamesQuery.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    return NextResponse.json({ 
      success: true,
      message: `Successfully purged ${oldTimedGamesQuery.size} archived timed games.`,
    });

  } catch (err) {
    console.error("TIMED_GAMES CLEANUP ERROR:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}