import { getAdminDb, admin } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";

// Mirrors the 30-minute payment window enforced client-side in
// src/app/deposit/direct/page.js. That page cancels an expired, unpaid
// deposit itself while the user is sitting on it, but a user who abandons
// the tab before submitting proof never triggers that write, leaving the
// deposit stuck on "pending" forever in both their history and the admin
// queue. This sweep catches those.
const PAYMENT_WINDOW_MS = 30 * 60 * 1000;

export async function GET() {
  try {
    const adminDb = getAdminDb();
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - PAYMENT_WINDOW_MS);

    const staleSnap = await adminDb
      .collection("deposits")
      .where("status", "==", "pending")
      .where("createdAt", "<=", cutoff)
      .get();

    let cancelled = 0;
    const BATCH_LIMIT = 400;
    let batch = adminDb.batch();
    let opsInBatch = 0;

    for (const depositDoc of staleSnap.docs) {
      const data = depositDoc.data() || {};
      // Proof already sent — this one is legitimately awaiting admin review,
      // not abandoned. Leave it alone.
      if (data.submittedAt || data.transactionHash) continue;

      batch.update(depositDoc.ref, {
        status: "cancelled",
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        cancelReason: "expired",
      });
      opsInBatch++;
      cancelled++;

      if (opsInBatch >= BATCH_LIMIT) {
        await batch.commit();
        batch = adminDb.batch();
        opsInBatch = 0;
      }
    }

    if (opsInBatch > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      message: `Deposit cleanup successful. Cancelled ${cancelled} expired deposit(s).`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Deposit Cleanup Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
