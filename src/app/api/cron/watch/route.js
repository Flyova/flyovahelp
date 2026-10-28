import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { expireUnpaidDeposits } from "@/lib/depositLock";
import { flagOverdueWithdrawals } from "@/lib/tradeWatch";

// Every minute (worker/index.js):
// - an agent withdrawal the agent said they paid (markPaid) that the player hasn't
//   confirmed within WITHDRAWAL_CONFIRM_MS: the player is flagged and the admins alerted
//   (once per trade: trades/{id}.overdueFlaggedAt; lib/tradeWatch);
// - a USDT deposit left unpaid past its 30-minute window, with no proof sent: cancelled,
//   and it counts toward the unpaid-deposit lock (lib/depositLock expireUnpaidDeposits).
// Both read the few open records by status alone, so no composite index is needed.

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const db = getAdminDb();
    const [flagged, cancelled] = await Promise.all([flagOverdueWithdrawals(db), expireUnpaidDeposits(db)]);
    return NextResponse.json({ ok: true, flagged, cancelled });
  } catch (e) {
    console.error("Watch cron error:", e);
    return NextResponse.json({ error: e?.message || "Watch failed" }, { status: 500 });
  }
}
