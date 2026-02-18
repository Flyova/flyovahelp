import { adminDb } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  console.log("--- STARTING DATABASE PURGE ---");
  
  try {
    const now = Date.now();
    
    // Retention Windows
    const thirtyMinsAgoDate = new Date(now - (30 * 60 * 1000)); // For predict_games
    const oneHourAgoNum = now - (60 * 60 * 1000);             // For timed_games (completedAt)

    const batch = adminDb.batch();
    let count = 0;

    // 1. Fetch old Predict Games (createdAt older than 30 mins)
    const predictSnap = await adminDb.collection("predict_games")
      .where("createdAt", "<", thirtyMinsAgoDate)
      .limit(50) 
      .get();

    predictSnap.docs.forEach((doc) => {
      batch.delete(doc.ref);
      count++;
    });

    // 2. Fetch old Timed Games (Status completed AND completedAt older than 1hr)
    const timedSnap = await adminDb.collection("timed_games")
      .where("status", "==", "completed")
      .where("completedAt", "<", oneHourAgoNum)
      .limit(50)
      .get();

    timedSnap.docs.forEach((doc) => {
      batch.delete(doc.ref);
      count++;
    });

    if (count > 0) {
      await batch.commit();
      console.log(`Purge Successful: ${count} records removed.`);
      return NextResponse.json({ 
        success: true, 
        message: `Successfully purged ${count} old records.`,
        details: {
          predict_games: predictSnap.size,
          timed_games: timedSnap.size
        }
      });
    }

    return NextResponse.json({ 
      success: true, 
      message: "Database is already optimized. No expired records found." 
    });

  } catch (err) {
    console.error("PURGE ERROR:", err);
    return NextResponse.json({ 
      success: false, 
      error: "Purge Failed", 
      details: err.message 
    }, { status: 500 });
  }
}