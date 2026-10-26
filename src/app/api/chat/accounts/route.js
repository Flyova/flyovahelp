import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { isValidUsername, norm, usernameUids } from "@/lib/chat";
import { sendEmail } from "@/lib/resend";

// Chat usernames work like accounts of their own. The owner can give one a password;
// anyone who has the username and password can then log in to it from their own
// StraWins account and chat as it (its chats, groups and profile), until they log
// out or the owner logs them out. Logged-in accounts are usernames/{name}.linkedUids;
// password hashes live in username_auth/{name} (server only).
//
//   GET                                          -> { items: [{ username, hasPassword, otherAccounts }] }  usernames you own
//   POST { action: "setPassword", username, password }   -> { ok }  owner: set or change it
//   POST { action: "removePassword", username }          -> { ok }  owner: also logs every other account out
//   POST { action: "logoutOthers", username }            -> { ok }  owner
//   POST { action: "login", username, password }         -> { ok } or { needsCode, sentTo }  any account; 5 wrong tries pause it 5 min
//   POST { action: "confirmLogin", username, code }      -> { ok }  the 6-digit code emailed to the username's owner
//   POST { action: "logout", username }                  -> { ok }  leave a username you logged in to
//
// The first time an account logs in to a username, the password isn't enough: a
// code is emailed to the username's owner, who passes it on only if they agree.
// After that the account is trusted (username_auth/{name}.trustedUids) until the
// owner changes or removes the password or logs the other accounts out.

const ITERATIONS = 20000;
const MAX_TRIES = 5;
const PAUSE_MS = 5 * 60 * 1000;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 64;
const WRONG = "Wrong username or password.";
const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_RESEND_MS = 60 * 1000;
const MAX_CODE_TRIES = 5;

const FV = () => admin.firestore.FieldValue;
const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const nameOf = (u) => norm(String(u || "").replace(/^@/, ""));

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
  return toB64(new Uint8Array(bits));
}

async function sha256(text) {
  return toB64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
}
const newCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");

/** "jo•••••@gmail.com" */
function maskEmail(email) {
  const [user, domain] = String(email || "").split("@");
  if (!domain) return "the owner's email";
  return `${user.slice(0, 2)}${"•".repeat(Math.max(3, user.length - 2))}@${domain}`;
}

// Compares without stopping at the first difference.
function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * After the accounts that can use `name` change, brings participantUids up to date
 * on every conversation it's in (one read of all members, one batch of writes).
 */
async function syncConversations(db, name) {
  const convos = (await db.collection("conversations").where("participants", "array-contains", name).get()).docs;
  if (!convos.length) return;
  const members = [...new Set(convos.flatMap((c) => c.data().participants || []))];
  const snaps = await db.getAll(...members.map((m) => db.collection("usernames").doc(m)));
  const uidsOf = new Map(snaps.map((s) => [s.id, s.exists && !s.data().deleted ? usernameUids(s.data()) : []]));
  let batch = db.batch();
  let writes = 0;
  for (const c of convos) {
    const want = [...new Set((c.data().participants || []).flatMap((m) => uidsOf.get(m) || []))].sort();
    const have = [...(c.data().participantUids || [])].sort();
    if (want.join() === have.join()) continue;
    batch.update(c.ref, { participantUids: want });
    if (++writes % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (writes % 400) await batch.commit();
}

/** The usernames doc for `username` if the caller owns it, else an error response. */
async function ownedOnly(db, caller, username) {
  const name = nameOf(username);
  if (!isValidUsername(name)) return { error: fail("Choose one of your usernames.") };
  const ref = db.collection("usernames").doc(name);
  const snap = await ref.get();
  if (!snap.exists || snap.data().deleted || snap.data().uid !== caller.uid) return { error: fail("Only the account that owns a username can do this.", 403) };
  return { name, ref, data: snap.data() };
}

async function setPassword(db, caller, { username, password }) {
  const pw = String(password || "");
  if (pw.length < MIN_PASSWORD || pw.length > MAX_PASSWORD) return fail(`Use a password of ${MIN_PASSWORD} to ${MAX_PASSWORD} characters.`);
  const { error, name } = await ownedOnly(db, caller, username);
  if (error) return error;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await db.collection("username_auth").doc(name).set({
    uid: caller.uid, salt: toB64(salt), hash: await hashPassword(pw, salt), tries: 0, pausedUntil: 0, updatedAt: FV().serverTimestamp(),
  });
  return NextResponse.json({ ok: true });
}

async function logoutOthers(db, caller, { username }) {
  const { error, name, ref, data } = await ownedOnly(db, caller, username);
  if (error) return error;
  // Logged-out accounts need a new emailed code to log in again.
  await db.collection("username_auth").doc(name).update({ trustedUids: [], pending: {} }).catch(() => null);
  if ((data.linkedUids || []).length) {
    await ref.update({ linkedUids: [] });
    await syncConversations(db, name);
  }
  return NextResponse.json({ ok: true });
}

async function removePassword(db, caller, body) {
  const { error, name } = await ownedOnly(db, caller, body.username);
  if (error) return error;
  await db.collection("username_auth").doc(name).delete();
  return logoutOthers(db, caller, body);
}

async function login(db, caller, { username, password }) {
  const name = nameOf(username);
  if (!isValidUsername(name)) return fail(WRONG, 403);
  const [nameSnap, authSnap] = await db.getAll(db.collection("usernames").doc(name), db.collection("username_auth").doc(name));
  const n = nameSnap.exists ? nameSnap.data() : null;
  if (!n || n.deleted) return fail(WRONG, 403);
  if (usernameUids(n).includes(caller.uid)) return fail(`@${name} is already on your account.`);
  if (!authSnap.exists) return fail(WRONG, 403);
  const auth = authSnap.data();
  if (Number(auth.pausedUntil || 0) > Date.now()) {
    return fail(`Too many wrong passwords for @${name}. Try again in ${Math.ceil((auth.pausedUntil - Date.now()) / 60000)} min.`, 429);
  }
  const ok = sameText(await hashPassword(String(password || ""), fromB64(auth.salt)), auth.hash);
  if (!ok) {
    const tries = Number(auth.tries || 0) + 1;
    await authSnap.ref.update(tries >= MAX_TRIES ? { tries: 0, pausedUntil: Date.now() + PAUSE_MS } : { tries });
    return fail(tries >= MAX_TRIES ? `Too many wrong passwords for @${name}. Try again in 5 min.` : WRONG, 403);
  }
  if (auth.tries) await authSnap.ref.update({ tries: 0, pausedUntil: 0 });

  // A new account: email the owner a code first.
  if (!(auth.trustedUids || []).includes(caller.uid)) {
    const pending = auth.pending?.[caller.uid];
    const ownerSnap = await db.collection("users").doc(n.uid).get();
    const ownerEmail = ownerSnap.exists ? ownerSnap.data().email : "";
    if (!ownerEmail) return fail("This username's owner has no email to send a code to, so it can't be logged in to from another account.");
    if (pending && Date.now() - Number(pending.sentAt || 0) < CODE_RESEND_MS) {
      return NextResponse.json({ needsCode: true, sentTo: maskEmail(ownerEmail) });
    }
    const code = newCode();
    await authSnap.ref.update({
      [`pending.${caller.uid}`]: { codeHash: await sha256(`${auth.salt}:${code}`), sentAt: Date.now(), expiresAt: Date.now() + CODE_TTL_MS, tries: 0 },
    });
    const sent = await sendEmail(
      ownerEmail,
      `Login code for @${name}`,
      `<p>Someone is trying to log in to your StraWins chat username <strong>@${name}</strong> from another account.</p>
       <p>If that's you, or someone you trust, the code is <strong style="font-size:20px;letter-spacing:3px">${code}</strong>. It expires in 10 minutes.</p>
       <p>If you don't know who it is, don't share the code, and change the username's password in Chat settings → Accounts.</p>`
    );
    if (!sent.success) return fail("Could not send the login code. Try again in a moment.", 502);
    return NextResponse.json({ needsCode: true, sentTo: maskEmail(ownerEmail) });
  }

  await nameSnap.ref.update({ linkedUids: FV().arrayUnion(caller.uid) });
  await syncConversations(db, name);
  return NextResponse.json({ ok: true, username: n.username || name });
}

async function confirmLogin(db, caller, { username, code }) {
  const name = nameOf(username);
  if (!isValidUsername(name)) return fail("Wrong code.", 403);
  const [nameSnap, authSnap] = await db.getAll(db.collection("usernames").doc(name), db.collection("username_auth").doc(name));
  const n = nameSnap.exists ? nameSnap.data() : null;
  if (!n || n.deleted || !authSnap.exists) return fail("Start again: log in with the username and password.", 400);
  const auth = authSnap.data();
  const pending = auth.pending?.[caller.uid];
  if (!pending) return fail("Start again: log in with the username and password.", 400);
  if (Date.now() > Number(pending.expiresAt || 0)) return fail("That code has expired. Log in again to get a new one.", 400);
  const ok = sameText(await sha256(`${auth.salt}:${String(code || "").replace(/\D/g, "")}`), pending.codeHash);
  if (!ok) {
    const tries = Number(pending.tries || 0) + 1;
    if (tries >= MAX_CODE_TRIES) {
      await authSnap.ref.update({ [`pending.${caller.uid}`]: FV().delete() });
      return fail("Too many wrong codes. Log in again to get a new one.", 429);
    }
    await authSnap.ref.update({ [`pending.${caller.uid}.tries`]: tries });
    return fail("Wrong code.", 403);
  }
  await authSnap.ref.update({ [`pending.${caller.uid}`]: FV().delete(), trustedUids: FV().arrayUnion(caller.uid) });
  await nameSnap.ref.update({ linkedUids: FV().arrayUnion(caller.uid) });
  await syncConversations(db, name);
  return NextResponse.json({ ok: true, username: n.username || name });
}

async function logout(db, caller, { username }) {
  const name = nameOf(username);
  const ref = db.collection("usernames").doc(name);
  const snap = await ref.get();
  if (!snap.exists || !(snap.data().linkedUids || []).includes(caller.uid)) return fail("You're not logged in to that username.");
  await ref.update({ linkedUids: FV().arrayRemove(caller.uid) });
  await syncConversations(db, name);
  return NextResponse.json({ ok: true });
}

export async function GET(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const db = getAdminDb();
    const owned = (await db.collection("usernames").where("uid", "==", caller.uid).get()).docs.filter((d) => !d.data().deleted);
    const auths = owned.length ? await db.getAll(...owned.map((d) => db.collection("username_auth").doc(d.id))) : [];
    return NextResponse.json({
      items: owned.map((d, i) => ({
        username: d.id,
        hasPassword: auths[i].exists,
        otherAccounts: (d.data().linkedUids || []).length,
      })),
    });
  } catch (e) {
    return fail(e?.message || "Something went wrong.", 500);
  }
}

const ACTIONS = { setPassword, removePassword, logoutOthers, login, confirmLogin, logout };

export async function POST(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const body = await req.json().catch(() => ({}));
    const run = Object.hasOwn(ACTIONS, body.action) ? ACTIONS[body.action] : null;
    if (!run) return fail("Unknown action.");
    return await run(getAdminDb(), caller, body);
  } catch (e) {
    console.error("Chat accounts error:", e);
    return fail(e?.message || "Something went wrong.", 500);
  }
}
