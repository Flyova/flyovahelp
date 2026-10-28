import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { FV } from "@/lib/money";
import { sendEmail } from "@/lib/resend";
import { alertAdmins } from "@/lib/notifications";

// Deleting your account. A request (deletion_requests/{uid}) only reaches the admins
// once the player confirms it from a link emailed to the account, so a stolen session
// can't delete it; /api/admin/delete-user refuses until then.
//
//   POST { action: "deleteRequest", reason? }  -> { sentTo }   signed in; emails the link (again)
//   POST { action: "deleteConfirm", uid, token } -> { ok }     the emailed link (/confirm-deletion), not signed in
//   POST { action: "deleteCancel" }             -> { ok }      signed in

const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const LINK_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const toB64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sha256 = async (text) => toB64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
const ms = (ts) => ts?.toMillis?.() || Number(ts || 0);
const requestRef = (db, uid) => db.collection("deletion_requests").doc(uid);

function maskEmail(email) {
  const [user, domain] = String(email || "").split("@");
  return domain ? `${user.slice(0, 2)}${"•".repeat(Math.max(3, user.length - 2))}@${domain}` : "your email";
}

async function deleteRequest(db, caller, { reason }, origin) {
  if (!caller) return fail("Sign in again to continue.", 401);
  const me = (await db.collection("users").doc(caller.uid).get()).data();
  if (!me) return fail("Account not found.", 404);
  const email = me.email || caller.email;
  if (!email) return fail("Your account has no email to confirm with. Contact support.", 409);
  const old = (await requestRef(db, caller.uid).get()).data();
  if (old?.emailConfirmedAt && old.status === "pending") return fail("Your deletion is confirmed and waiting for an admin.", 409);
  if (old && Date.now() - ms(old.emailSentAt) < RESEND_MS) return fail("We just sent the link. Wait a minute before asking for another.", 429);

  const token = toB64(crypto.getRandomValues(new Uint8Array(24)));
  await requestRef(db, caller.uid).set({
    uid: caller.uid, username: me.username || "", email, walletBalance: Number(me.wallet || 0),
    reason: String(reason || "").trim().slice(0, 300), requestDate: FV().serverTimestamp(), status: "unconfirmed",
    tokenHash: await sha256(token), tokenExpires: Date.now() + LINK_TTL_MS, emailSentAt: Date.now(),
  });
  const link = `${origin}/confirm-deletion?u=${encodeURIComponent(caller.uid)}&t=${token}`;
  const res = await sendEmail(email, "Confirm your StraWins account deletion", `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
      <h2 style="margin: 0 0 12px;">Confirm account deletion</h2>
      <p>You asked to delete your StraWins account${me.username ? ` (@${me.username})` : ""}. Your balance, history and chat usernames will be removed for good once an admin processes it.</p>
      <p><a href="${link}" style="display: inline-block; background: #8B1E3F; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: bold;">Yes, delete my account</a></p>
      <p style="color: #777; font-size: 12px;">The link works for 24 hours. If you didn't ask for this, ignore this email and change your password.</p>
    </div>`);
  if (!res?.success) return fail("We couldn't send the confirmation email. Please try again.", 502);
  return NextResponse.json({ sentTo: maskEmail(email) });
}

async function deleteConfirm(db, _caller, { uid, token }) {
  if (!uid || typeof uid !== "string" || !token || typeof token !== "string") return fail("This link isn't valid.", 400);
  const ref = requestRef(db, uid);
  const hash = await sha256(token);
  const out = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const r = snap.data();
    if (!r || r.tokenHash !== hash) return { error: "This link isn't valid. Ask for a new one in Settings.", status: 404 };
    if (r.emailConfirmedAt) return { already: true, r };
    if (Date.now() > Number(r.tokenExpires || 0)) return { error: "This link has expired. Ask for a new one in Settings.", status: 410 };
    const now = FV().serverTimestamp();
    tx.update(ref, { status: "pending", emailConfirmedAt: now, requestDate: now });
    tx.update(db.collection("users").doc(uid), { deletionRequested: true, deletionRequestDate: now });
    return { r };
  });
  if (out.error) return fail(out.error, out.status);
  if (!out.already) {
    await alertAdmins(db, {
      type: "deletion", title: "Account deletion confirmed",
      body: `@${out.r.username || "player"} confirmed deleting their account from their email (wallet $${Number(out.r.walletBalance || 0).toFixed(2)}).`,
      uid, url: "/admin/deletions",
    });
  }
  return NextResponse.json({ ok: true });
}

async function deleteCancel(db, caller) {
  if (!caller) return fail("Sign in again to continue.", 401);
  await requestRef(db, caller.uid).delete();
  await db.collection("users").doc(caller.uid).update({ deletionRequested: false, deletionRequestDate: FV().delete() });
  return NextResponse.json({ ok: true });
}

const ACTIONS = { deleteRequest, deleteConfirm, deleteCancel };

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const run = Object.hasOwn(ACTIONS, body.action) ? ACTIONS[body.action] : null;
    if (!run) return fail("Unknown action.");
    const caller = body.action === "deleteConfirm" ? null : await getCaller(req);
    const url = new URL(req.url);
    const origin = /^https?:$/.test(url.protocol) && url.hostname !== "cron.internal" ? url.origin : "https://strawins.com";
    return await run(getAdminDb(), caller, body, origin);
  } catch (e) {
    console.error("Account error:", e);
    return fail("Something went wrong. Please try again.", 500);
  }
}
