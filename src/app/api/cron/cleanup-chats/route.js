import { getAdminDb } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const adminDb = getAdminDb();
    const BATCH_LIMIT = 400;
    let totalDeleted = 0;
    let opsInBatch = 0;
    let batch = adminDb.batch();
    const cutoffMs = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    // collectionGroup("support_chats") covers top-level + nested support chats.
    const chatsSnap = await adminDb.collectionGroup("support_chats").get();
    for (const chatDoc of chatsSnap.docs) {
      const data = chatDoc.data() || {};
      const updatedAtMs = data.updatedAt?.toMillis?.() || 0;
      if (updatedAtMs > 0 && updatedAtMs < cutoffMs) {
        batch.delete(chatDoc.ref);
        opsInBatch++;
        totalDeleted++;

        if (opsInBatch >= BATCH_LIMIT) {
          await batch.commit();
          batch = adminDb.batch();
          opsInBatch = 0;
        }
      }
    }

    if (opsInBatch > 0) {
      await batch.commit();
    }

    return NextResponse.json({ 
      success: true, 
      message: `Support cleanup successful. Deleted ${totalDeleted} stale chat documents.`,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error("Cleanup Error:", err);
    return NextResponse.json({ 
      success: false, 
      error: err.message 
    }, { status: 500 });
  }
}
