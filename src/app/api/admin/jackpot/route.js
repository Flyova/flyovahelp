import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { resolvePrivilegedRole } from "@/lib/adminAccess";
import { formatUsd, parseAmount } from "@/lib/money";
import { sendPushToUsers } from "@/lib/push";

// POST /api/admin/jackpot — Admin → Send Jackpot.
//
//   { recipients: [{ uid, amount }] }  -> { count, total }
//
// Each player gets a pending jackpots/{id} (claimed from the dashboard, /api/wallet
// "jackpot") and a notification about it, all written in one batch tagged with the same
// batchId; then a push to their phone (unless they switched "Success" pushes off).

const MAX_RECIPIENTS = 100;
const UID = /^[A-Za-z0-9_-]{1,128}$/;
const FV = () => admin.firestore.FieldValue;
const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const titleOf = (amount) => `Jackpot: ${formatUsd(amount)}`;
const BODY = "You received a jackpot! Claim it on your dashboard.";

async function isAdminCaller(db, caller) {
  const me = await db.collection("users").doc(caller.uid).get();
  return resolvePrivilegedRole(me.exists ? me.data().role : null, caller.email) === "admin";
}

export async function POST(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const db = getAdminDb();
    if (!(await isAdminCaller(db, caller))) return fail("Admins only.", 403);

    const { recipients } = await req.json().catch(() => ({}));
    if (!Array.isArray(recipients) || !recipients.length) return fail("Add at least one player.");
    if (recipients.length > MAX_RECIPIENTS) return fail(`Send to at most ${MAX_RECIPIENTS} players at a time.`);
    const rows = recipients.map((r) => ({ uid: String(r?.uid || ""), amount: parseAmount(r?.amount) }));
    if (rows.some((r) => !UID.test(r.uid))) return fail("Choose the players again.");
    if (new Set(rows.map((r) => r.uid)).size !== rows.length) return fail("A player is on the list twice.");
    const bad = rows.filter((r) => r.amount === null).length;
    if (bad) return fail(`Enter an amount for ${bad === 1 ? "1 player" : `${bad} players`} (more than $0, at most 2 decimals).`);

    const users = await db.getAll(...rows.map((r) => db.collection("users").doc(r.uid)));
    const gone = users.filter((u) => !u.exists).length;
    if (gone) return fail(`${gone === 1 ? "1 player's account was" : `${gone} players' accounts were`} deleted. Remove them and try again.`);

    const batch = db.batch();
    const batchId = db.collection("jackpots").doc().id;
    rows.forEach((r, i) => {
      const jackpot = db.collection("jackpots").doc();
      batch.set(jackpot, {
        userId: r.uid,
        userEmail: users[i].data().email || "",
        amount: r.amount,
        status: "pending", // pending, claimed
        createdAt: FV().serverTimestamp(),
        type: "ADMIN_GIFT",
        batchId,
        sentBy: caller.uid,
      });
      // As lib/notifications notifyUser stores it ("success": money received).
      batch.set(db.collection("users").doc(r.uid).collection("notifications").doc(`jackpot_${jackpot.id}`), {
        type: "success", title: titleOf(r.amount), body: BODY, url: "/dashboard", read: false, createdAt: FV().serverTimestamp(),
      });
    });
    await batch.commit();

    // The jackpots are sent; a failed push doesn't change that.
    try {
      await sendPushToUsers(rows.map((r) => ({ uid: r.uid, title: titleOf(r.amount) })), {
        title: "Jackpot", body: BODY, data: { kind: "success", url: "/dashboard" }, pref: "success",
      });
    } catch (e) {
      console.error("Jackpot push failed:", e?.message || e);
    }
    const total = rows.reduce((s, r) => s + Math.round(r.amount * 100), 0) / 100;
    return NextResponse.json({ count: rows.length, total });
  } catch (e) {
    console.error("Jackpot send error:", e);
    return fail(e?.message || "Could not send the jackpots.", 500);
  }
}
