import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { resolvePrivilegedRole } from "@/lib/adminAccess";
import { formatUsd } from "@/lib/money";
import { recordInvalidDeposit } from "@/lib/depositLock";

// Admin-only follow-ups the admin pages can't do in the browser.
//
//   POST { action: "depositRejected", depositId } -> { ok, locked }  a USDT deposit an admin just rejected
//        counts toward the player's unpaid-deposit lock (lib/depositLock)

const fail = (error, status = 400) => NextResponse.json({ error }, { status });

async function depositRejected(db, { depositId }) {
  if (!depositId || typeof depositId !== "string") return fail("Deposit not found.", 404);
  const snap = await db.collection("deposits").doc(depositId).get();
  if (!snap.exists) return fail("Deposit not found.", 404);
  const d = snap.data();
  if (d.status !== "rejected") return fail("This deposit isn't rejected.", 409);
  const locked = await recordInvalidDeposit(db, d.userId, { sourceId: `deposit_${depositId}`, what: `a ${formatUsd(d.amount)} USDT deposit rejected by an admin` });
  return NextResponse.json({ ok: true, locked });
}

const ACTIONS = { depositRejected };

export async function POST(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const db = getAdminDb();
    const me = (await db.collection("users").doc(caller.uid).get()).data();
    if (resolvePrivilegedRole(me?.role, caller.email) !== "admin") return fail("Administrative access required.", 403);
    const body = await req.json().catch(() => ({}));
    const run = Object.hasOwn(ACTIONS, body.action) ? ACTIONS[body.action] : null;
    if (!run) return fail("Unknown action.");
    return await run(db, body);
  } catch (e) {
    console.error("Admin alerts error:", e);
    return fail("Something went wrong. Please try again.", 500);
  }
}
