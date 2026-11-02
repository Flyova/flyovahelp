import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { liveUsername, ownedUsername, usernameUids } from "@/lib/chat";
import { lockIfReported } from "@/lib/chatLock";

// POST /api/chat/reports { as, reported, reason, room?, convoId?, messageId?, messageText?, encrypted?, from? } -> { ok }
// Reporting a player in Chats. Reports are made here (the rules don't let apps write
// chat_reports) so each one carries the accounts on both sides: reporterUid (the
// caller) and reportedUid (who owns the reported username). Admins read them on
// Admin → Chat Activity. Once CHAT_LOCK_REPORTS different accounts have open reports
// against an account, its Chats lock (lib/chatLock).

const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const GAP_MS = 3000; // one report every few seconds per account
const RATE_COLLECTION = "chat_report_rate"; // per-account { lastAt } — server only

export async function POST(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const body = await req.json().catch(() => ({}));
    const reason = String(body.reason || "").trim().slice(0, 100);
    if (!reason) return fail("Choose a reason for the report.");
    const db = getAdminDb();
    const [me, other] = await Promise.all([ownedUsername(db, caller.uid, body.as), liveUsername(db, body.reported)]);
    if (!me) return fail("You can only report as one of your own usernames.", 403);
    if (!other) return fail("That player doesn't exist any more.", 404);
    if (usernameUids(other).includes(caller.uid)) return fail("You can't report yourself.");

    const extra = {};
    if (body.room === "public") extra.room = "public";
    if (ID.test(String(body.convoId || ""))) extra.convoId = String(body.convoId);
    if (ID.test(String(body.messageId || ""))) extra.messageId = String(body.messageId);
    if (typeof body.messageText === "string") extra.messageText = body.messageText.slice(0, 500);
    // From an end-to-end encrypted chat: the text (if any) is what the reporter's device sent in.
    if (body.encrypted === true && extra.convoId) extra.encrypted = true;
    if (body.from === "profile") extra.from = "profile";

    const rateRef = db.collection(RATE_COLLECTION).doc(caller.uid);
    const reportRef = db.collection("chat_reports").doc();
    const now = Date.now();
    const refused = await db.runTransaction(async (tx) => {
      const last = Number((await tx.get(rateRef)).data()?.lastAt || 0);
      if (now - last < GAP_MS) return "You just sent a report. Try again in a few seconds.";
      tx.set(rateRef, { lastAt: now });
      tx.set(reportRef, {
        reporter: me.lower, reporterUid: caller.uid, reported: other.lower, reportedUid: other.uid, reason, ...extra,
        status: "open", createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return null;
    });
    if (refused) return fail(refused, 429);
    await lockIfReported(db, other.uid).catch((e) => console.error("Report lock check failed:", e));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Chat report error:", e);
    return fail(e?.message || "Something went wrong.", 500);
  }
}
