import { adminDb } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const batch = adminDb.batch();
    let totalDeleted = 0;

    // 1. Fetch top-level support_chats
    const mainChatsSnap = await adminDb.collection("support_chats").get();
    mainChatsSnap.forEach((doc) => {
      batch.delete(doc.ref);
      totalDeleted++;
    });

    // 2. Fetch nested support_chats inside users (collectionGroup)
    // This targets /users/{userId}/support_chats/{chatId}
    const nestedChatsSnap = await adminDb.collectionGroup("support_chats").get();
    nestedChatsSnap.forEach((doc) => {
      batch.delete(doc.ref);
      totalDeleted++;
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