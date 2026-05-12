import { getAdminDb } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const adminDb = getAdminDb();
    const batch = adminDb.batch();
    let totalDeleted = 0;
    const cutoffMs = Date.now() - (7 * 24 * 60 * 60 * 1000);

    // 1. Fetch top-level support_chats
    const mainChatsSnap = await adminDb.collection("support_chats").get();
    mainChatsSnap.forEach((chatDoc) => {
      const data = chatDoc.data() || {};
      const updatedAtMs = data.updatedAt?.toMillis?.() || 0;
      if (updatedAtMs > 0 && updatedAtMs < cutoffMs) {
        batch.delete(chatDoc.ref);
        totalDeleted++;
      }
    });

    // 2. Fetch nested support_chats inside users (collectionGroup)
    // This targets /users/{userId}/support_chats/{chatId}
    const nestedChatsSnap = await adminDb.collectionGroup("support_chats").get();
    nestedChatsSnap.forEach((chatDoc) => {
      const data = chatDoc.data() || {};
      const updatedAtMs = data.updatedAt?.toMillis?.() || 0;
      if (updatedAtMs > 0 && updatedAtMs < cutoffMs) {
        batch.delete(chatDoc.ref);
        totalDeleted++;
      }
    });

    // 3. Commit the deletions
    if (totalDeleted > 0) {
      await batch.commit();
    }

    return NextResponse.json({ 
      success: true, 
      message: `Support cleanup successful. Deleted ${totalDeleted} documents.`,
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
