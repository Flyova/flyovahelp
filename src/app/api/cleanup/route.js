import { adminDb } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";

// Force Next.js to treat this as a dynamic API route
export const dynamic = "force-dynamic";

export async function GET() {
  console.log("--- STARTING DATABASE CLEANUP ---");
  
  try {
    const now = Date.now();
    // 30 Minutes ago for Predict Games (Date object for serverTimestamp comparison)
    const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000);
    // 1 Hour ago for Timed Games (Number for your existing timed_games logic)
    const oneHourAgo = now - (60 * 60 * 1000);

    const batch = adminDb.batch();
    let predictDeleted = 0;
    let timedDeleted = 0;

    // 1. Fetch Predict Games (30 min retention)
    const predictSnap = await adminDb.collection("predict_games")
      .where("createdAt", "<", thirtyMinutesAgo)
      .limit(200) 
      .get();

    predictSnap.docs.forEach((doc) => {
      batch.delete(doc.ref);
      predictDeleted++;
    });

    // 2. Fetch Timed Games (1 hour retention)
    const timedSnap = await adminDb.collection("timed_games")
      .where("status", "==", "completed")
      .where("completedAt", "<", oneHourAgo)
      .limit(200)
      .get();

    timedSnap.docs.forEach((doc) => {
      batch.delete(doc.ref);
      timedDeleted++;
    });

    const totalDeleted = predictDeleted + timedDeleted;

    // SUCCESS MESSAGE: Nothing to delete
    if (totalDeleted === 0) {
      console.log("Cleanup: No documents found to purge.");
      return NextResponse.json({ 
        success: true, 
        message: "Database is already clean. No archives found.",
        stats: { predict_games: 0, timed_games: 0 }
      });
    }

    // Execute deletions
    await batch.commit();
    console.log(`Cleanup: Successfully purged ${totalDeleted} records.`);

    // SUCCESS MESSAGE: Records deleted
    return NextResponse.json({ 
      success: true, 
      message: "Cleanup Successful",
      purged_records: totalDeleted,
      details: {
        predict_games_cleared: predictDeleted,
        timed_games_cleared: timedDeleted
      }
    });

  } catch (err) {
    console.error("CLEANUP ENGINE ERROR:", err);
    // ERROR MESSAGE: Something went wrong
    return NextResponse.json({ 
      success: false, 
      error: "Cleanup Failed", 
      details: err.message 
    }, { status: 500 });
  }
}