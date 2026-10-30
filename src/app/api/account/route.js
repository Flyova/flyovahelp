import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { FV, isValidAccountName } from "@/lib/money";
import { sendEmail } from "@/lib/resend";
import { alertAdmins, notifyUser } from "@/lib/notifications";

// Changes to the account that need the owner's email: deleting it, and changing its
// full name or email address. Each is confirmed from a link emailed to the account's
// current address, so a stolen session can't do them.
//
// A deletion request (deletion_requests/{uid}) only reaches the admins once confirmed;
// /api/admin/delete-user refuses until then. A name or email change (profile_changes/
// {uid}, server only) is made when its link is opened; a bank account's beneficiary
// name follows the new name.
//
//   POST { action: "deleteRequest", reason? }  -> { sentTo }   signed in; emails the link (again)
//   POST { action: "deleteConfirm", uid, token } -> { ok }     the emailed link (/confirm-deletion), not signed in
//   POST { action: "deleteCancel" }             -> { ok }      signed in
//   POST { action: "profileChangeRequest", fullName?, email? } -> { sentTo }   signed in
//   POST { action: "profileChangeConfirm", uid, token } -> { ok, fullName, email }   the emailed link (/confirm-change)

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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const changeRef = (db, uid) => db.collection("profile_changes").doc(uid);

async function profileChangeRequest(db, caller, { fullName, email }, origin) {
  if (!caller) return fail("Sign in again to continue.", 401);
  const me = (await db.collection("users").doc(caller.uid).get()).data();
  if (!me) return fail("Account not found.", 404);
  const current = me.email || caller.email;
  if (!current) return fail("Your account has no email to confirm with. Contact support.", 409);
  const name = fullName == null ? null : String(fullName).trim().replace(/\s+/g, " ");
  const mail = email == null ? null : String(email).trim().toLowerCase();
  const change = {};
  if (name && name !== me.fullName) {
    if (!isValidAccountName(name) || name.length > 80) return fail("Enter your full first and last name (e.g. John Doe); single names or initials aren't accepted.");
    change.fullName = name;
  }
  if (mail && mail !== String(current).toLowerCase()) {
    if (!EMAIL.test(mail) || mail.length > 120) return fail("Enter a valid email address.");
    const taken = await db.collection("users").where("emailLower", "==", mail).limit(1).get();
    if (!taken.empty || (await admin.auth().getUserByEmail(mail).catch(() => null))) return fail("That email is already used by another account.", 409);
    change.email = mail;
  }
  if (!Object.keys(change).length) return fail("Nothing to change.");
  const old = (await changeRef(db, caller.uid).get()).data();
  if (old && Date.now() - ms(old.emailSentAt) < RESEND_MS) return fail("We just sent a link. Wait a minute before asking for another.", 429);

  const token = toB64(crypto.getRandomValues(new Uint8Array(24)));
  await changeRef(db, caller.uid).set({ ...change, tokenHash: await sha256(token), tokenExpires: Date.now() + LINK_TTL_MS, emailSentAt: Date.now() });
  const link = `${origin}/confirm-change?u=${encodeURIComponent(caller.uid)}&t=${token}`;
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const lines = [
    change.fullName && `Account name: <strong>${esc(me.fullName || "")}</strong> → <strong>${esc(change.fullName)}</strong>`,
    change.email && `Email: <strong>${esc(current)}</strong> → <strong>${esc(change.email)}</strong>`,
  ].filter(Boolean);
  const res = await sendEmail(current, "Confirm your StraWins account change", `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
      <h2 style="margin: 0 0 12px;">Confirm the change to your account</h2>
      <p>${lines.join("<br/>")}</p>
      ${change.fullName && me.bank?.accountNumber ? "<p>Your bank account for agent trades must be in this name too.</p>" : ""}
      <p><a href="${link}" style="display: inline-block; background: #2457D6; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: bold;">Yes, make this change</a></p>
      <p style="color: #777; font-size: 12px;">The link works for 24 hours. If you didn't ask for this, ignore this email and change your password.</p>
    </div>`);
  if (!res?.success) return fail("We couldn't send the confirmation email. Please try again.", 502);
  return NextResponse.json({ sentTo: maskEmail(current) });
}

async function profileChangeConfirm(db, _caller, { uid, token }) {
  if (!uid || typeof uid !== "string" || !token || typeof token !== "string") return fail("This link isn't valid.", 400);
  const ref = changeRef(db, uid);
  const c = (await ref.get()).data();
  if (!c || c.tokenHash !== (await sha256(token))) return fail("This link isn't valid or was already used. Ask for a new one in Settings.", 404);
  if (Date.now() > Number(c.tokenExpires || 0)) return fail("This link has expired. Ask for a new one in Settings.", 410);
  const userRef = db.collection("users").doc(uid);
  const me = (await userRef.get()).data();
  if (!me) return fail("Account not found.", 404);
  if (c.email) {
    try {
      await admin.auth().updateUser(uid, { email: c.email });
    } catch {
      return fail("That email is already used by another account.", 409);
    }
  }
  await userRef.update({
    ...(c.fullName ? { fullName: c.fullName, ...(me.bank?.accountNumber ? { "bank.accountName": c.fullName } : {}) } : {}),
    ...(c.email ? { email: c.email, emailLower: c.email } : {}),
    profileChangedAt: FV().serverTimestamp(),
  });
  await ref.delete();
  await notifyUser(db, uid, {
    type: "account", title: "Account details changed",
    body: [c.fullName && `Name: ${c.fullName}`, c.email && `Email: ${c.email}`].filter(Boolean).join(" · "), url: "/settings",
  });
  return NextResponse.json({ ok: true, fullName: c.fullName || me.fullName || "", email: c.email || me.email || "" });
}

const ACTIONS = { deleteRequest, deleteConfirm, deleteCancel, profileChangeRequest, profileChangeConfirm };
const SIGNED_OUT = new Set(["deleteConfirm", "profileChangeConfirm"]);

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const run = Object.hasOwn(ACTIONS, body.action) ? ACTIONS[body.action] : null;
    if (!run) return fail("Unknown action.");
    const caller = SIGNED_OUT.has(body.action) ? null : await getCaller(req);
    const url = new URL(req.url);
    const origin = /^https?:$/.test(url.protocol) && url.hostname !== "cron.internal" ? url.origin : "https://strawins.com";
    return await run(getAdminDb(), caller, body, origin);
  } catch (e) {
    console.error("Account error:", e);
    return fail("Something went wrong. Please try again.", 500);
  }
}
