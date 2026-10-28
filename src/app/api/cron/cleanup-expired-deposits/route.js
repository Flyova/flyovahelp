import { getAdminDb } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";
import { expireUnpaidDeposits } from "@/lib/depositLock";

// The deposit page's occasional sweep of USDT deposits whose 30-minute payment window
// ran out unpaid (the every-minute /api/cron/watch does the same). Each one counts
// toward the unpaid-deposit lock.
export async function GET() {
  try {
    const cancelled = await expireUnpaidDeposits(getAdminDb());
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
