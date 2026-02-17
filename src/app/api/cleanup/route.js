import { adminDb } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const now = Date.now();
    const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000);
    const oneHourAgo = now - (60 * 60 * 1000);

    const batch = adminDb.batch();
    let count = 0;

    // Small limits (50) to stay under the 20k daily write limit
    const pSnap = await adminDb.collection("predict_games")
      .where("createdAt", "<", thirtyMinutesAgo)
      .limit(50).get();

    const tSnap = await adminDb.collection("timed_games")
      .where("status", "==", "completed")
      .where("completedAt", "<", oneHourAgo)
      .limit(50).get();

    pSnap.docs.forEach(d => { batch.delete(d.ref); count++; });
    tSnap.docs.forEach(d => { batch.delete(d.ref); count++; });

    if (count > 0) {
      await batch.commit();
      return NextResponse.json({ success: true, message: `Purged ${count} records safely.` });
    }

    return NextResponse.json({ success: true, message: "Clean." });

  } catch (err) {
    // If you see Quota Exceeded here, it means you must wait 24 hours for Firebase to reset
    return NextResponse.json({ success: false, error: "Quota Hit", details: err.message }, { status: 500 });
  }
}