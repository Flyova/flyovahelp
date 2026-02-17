import { adminDb } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // 1. Define the "Cut-off" time (30 minutes ago)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    // 2. Query for old documents
    // Note: This requires a 'createdAt' field in your predict_games docs
    const oldGamesQuery = await adminDb.collection("predict_games")
      .where("createdAt", "<", thirtyMinutesAgo)
      .limit(500) // Firebase batch limit is 500
      .get();

    if (oldGamesQuery.empty) {
      return NextResponse.json({ message: "No old games to delete." });
    }

    // 3. Perform Batch Deletion
    const batch = adminDb.batch();
    oldGamesQuery.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    return NextResponse.json({ 
      message: `Successfully cleared ${oldGamesQuery.size} archived games.`,
      clearedCount: oldGamesQuery.size 
    });

  } catch (err) {
    console.error("CLEANUP ENGINE ERROR:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}