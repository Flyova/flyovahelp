import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { ownedUsername } from "@/lib/chat";

// Chat account PINs ("password for each chat account"): each extra chat username
// can be locked with a 4–8 digit PIN, asked before you switch to it (its chats stay
// hidden until then). Your main username is protected by the account password.
// PIN hashes live in username_locks/{lower}, which only the server can touch.
//
//   GET                                         -> { locked: [usernameLower] }  your locked usernames
//   POST { action: "set", username, pin, currentPin? } -> { ok }   lock, or change the PIN (needs the current one)
//   POST { action: "unlock", username, pin }    -> { ok }   check a PIN; 5 wrong tries pause it for 5 minutes
//   POST { action: "remove", username, pin? }   -> { ok }   needs the PIN, or a sign-in in the last 5 minutes (forgot PIN)

const ITERATIONS = 20000;
const MAX_TRIES = 5;
const PAUSE_MS = 5 * 60 * 1000;
const RECENT_LOGIN_S = 5 * 60;
const PIN_RE = /^\d{4,8}$/;

const FV = () => admin.firestore.FieldValue;
const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function hashPin(pin, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
  return toB64(new Uint8Array(bits));
}

// Compares without stopping at the first difference.
function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Checks `pin` against a lock, counting wrong tries. Returns null when it matches, else an error response. */
async function checkPin(ref, lock, pin) {
  if (Number(lock.pausedUntil || 0) > Date.now()) {
    return fail(`Too many wrong PINs. Try again in ${Math.ceil((lock.pausedUntil - Date.now()) / 60000)} min.`, 429);
  }
  if (PIN_RE.test(String(pin || "")) && sameText(await hashPin(String(pin), fromB64(lock.salt)), lock.hash)) {
    if (lock.tries) await ref.update({ tries: 0, pausedUntil: 0 });
    return null;
  }
  const tries = Number(lock.tries || 0) + 1;
  await ref.update(tries >= MAX_TRIES ? { tries: 0, pausedUntil: Date.now() + PAUSE_MS } : { tries });
  return fail(tries >= MAX_TRIES ? "Too many wrong PINs. Try again in 5 min." : "Wrong PIN.", 403);
}

async function lockable(db, caller, username) {
  const me = await ownedUsername(db, caller.uid, username);
  if (!me) return { error: fail("That isn't one of your chat usernames.", 403) };
  if (me.isDefault) return { error: fail("Your main username is protected by your account password.") };
  const ref = db.collection("username_locks").doc(me.lower);
  const snap = await ref.get();
  return { me, ref, lock: snap.exists ? snap.data() : null };
}

async function setPin(db, caller, { username, pin, currentPin }) {
  if (!PIN_RE.test(String(pin || ""))) return fail("Use a PIN of 4 to 8 digits.");
  const { error, ref, lock } = await lockable(db, caller, username);
  if (error) return error;
  if (lock) {
    const wrong = await checkPin(ref, lock, currentPin);
    if (wrong) return wrong;
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await ref.set({
    uid: caller.uid, salt: toB64(salt), hash: await hashPin(String(pin), salt), tries: 0, pausedUntil: 0,
    updatedAt: FV().serverTimestamp(),
  });
  return NextResponse.json({ ok: true });
}

async function unlock(db, caller, { username, pin }) {
  const { error, ref, lock } = await lockable(db, caller, username);
  if (error) return error;
  if (!lock) return NextResponse.json({ ok: true });
  return (await checkPin(ref, lock, pin)) || NextResponse.json({ ok: true });
}

async function removePin(db, caller, { username, pin }) {
  const { error, ref, lock } = await lockable(db, caller, username);
  if (error) return error;
  if (!lock) return NextResponse.json({ ok: true });
  const justSignedIn = Number(caller.auth_time || 0) > Date.now() / 1000 - RECENT_LOGIN_S;
  if (!justSignedIn) {
    const wrong = await checkPin(ref, lock, pin);
    if (wrong) return wrong;
  }
  await ref.delete();
  return NextResponse.json({ ok: true });
}

export async function GET(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const snap = await getAdminDb().collection("username_locks").where("uid", "==", caller.uid).get();
    return NextResponse.json({ locked: snap.docs.map((d) => d.id) });
  } catch (e) {
    return fail(e?.message || "Something went wrong.", 500);
  }
}

const ACTIONS = { set: setPin, unlock, remove: removePin };

export async function POST(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const body = await req.json().catch(() => ({}));
    const run = Object.hasOwn(ACTIONS, body.action) ? ACTIONS[body.action] : null;
    if (!run) return fail("Unknown action.");
    return await run(getAdminDb(), caller, body);
  } catch (e) {
    console.error("Chat locks error:", e);
    return fail(e?.message || "Something went wrong.", 500);
  }
}
