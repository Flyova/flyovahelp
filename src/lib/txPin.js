import { admin } from "@/lib/firebaseAdmin";
import { sendEmail } from "@/lib/resend";

// The 4-digit PIN a player types to send a transfer or withdraw (USDT or with an
// agent). Its hash lives in tx_pins/{uid}, which no app can read (no rules match);
// users/{uid}.hasTxPin only says one is set. Five wrong tries pause it for 15
// minutes. A forgotten PIN is replaced with a 6-digit code emailed to the account.

const ITERATIONS = 20000;
const MAX_TRIES = 5;
const PAUSE_MS = 15 * 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_RESEND_MS = 60 * 1000;
const MAX_CODE_TRIES = 5;

const FV = () => admin.firestore.FieldValue;
const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const pinRef = (db, uid) => db.collection("tx_pins").doc(uid);
const ms = (ts) => ts?.toMillis?.() || Number(ts || 0);

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

/** Why a new PIN can't be used, or null. 0000-style and 1234-style PINs are too easy to guess. */
export function weakPin(pin) {
  if (!/^\d{4}$/.test(String(pin || ""))) return "Your PIN must be exactly 4 digits.";
  const d = [...pin].map(Number);
  if (d.every((x) => x === d[0])) return "Choose a PIN that isn't the same digit four times.";
  const step = d[1] - d[0];
  if (Math.abs(step) === 1 && d.every((x, i) => i === 0 || x - d[i - 1] === step)) return "Choose a PIN that isn't a straight run like 1234.";
  return null;
}

async function storePin(db, uid, pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await pinRef(db, uid).set({ hash: await hashPin(pin, salt), salt: toB64(salt), tries: 0, pausedUntil: 0, updatedAt: FV().serverTimestamp() });
  await db.collection("users").doc(uid).update({ hasTxPin: true });
}

/**
 * Checks the PIN for a transfer or withdrawal. Returns null when it's right,
 * otherwise { error, status }: 428 when none is set yet, 423 while paused.
 */
export async function checkTxPin(db, uid, pin) {
  const snap = await pinRef(db, uid).get();
  if (!snap.exists) return { error: "Set your 4-digit transaction PIN in Settings first. It keeps your money safe.", status: 428 };
  const saved = snap.data();
  const left = ms(saved.pausedUntil) - Date.now();
  if (left > 0) return { error: `Too many wrong PINs. Try again in ${Math.ceil(left / 60000)} min, or reset it in Settings.`, status: 423 };
  const typed = String(pin ?? "").trim();
  if (/^\d{4}$/.test(typed) && sameText(await hashPin(typed, fromB64(saved.salt)), saved.hash)) {
    if (saved.tries) await pinRef(db, uid).update({ tries: 0 });
    return null;
  }
  const tries = Number(saved.tries || 0) + 1;
  if (tries >= MAX_TRIES) {
    await pinRef(db, uid).update({ tries: 0, pausedUntil: Date.now() + PAUSE_MS });
    return { error: "Too many wrong PINs. Your PIN is paused for 15 minutes, or you can reset it in Settings.", status: 423 };
  }
  await pinRef(db, uid).update({ tries });
  return { error: `Wrong PIN. ${MAX_TRIES - tries} ${MAX_TRIES - tries === 1 ? "try" : "tries"} left.`, status: 403 };
}

/**
 * Sets the PIN: the first one freely, a new one with the current PIN or a reset
 * code from resetCode(). Returns null or { error, status }.
 */
export async function setTxPin(db, uid, { pin, currentPin, code }) {
  const weak = weakPin(String(pin ?? "").trim());
  if (weak) return { error: weak, status: 400 };
  const snap = await pinRef(db, uid).get();
  if (snap.exists) {
    if (code) {
      const saved = snap.data();
      if (!saved.codeHash || ms(saved.codeExpires) < Date.now()) return { error: "That code has expired. Send a new one.", status: 400 };
      if (!sameText(await hashPin(String(code).trim(), fromB64(saved.salt)), saved.codeHash)) {
        const tries = Number(saved.codeTries || 0) + 1;
        await pinRef(db, uid).update(tries >= MAX_CODE_TRIES ? { codeHash: FV().delete(), codeTries: 0 } : { codeTries: tries });
        return { error: tries >= MAX_CODE_TRIES ? "Too many wrong codes. Send a new one." : "That code is wrong.", status: 403 };
      }
    } else {
      const bad = await checkTxPin(db, uid, currentPin);
      if (bad) return bad.status === 403 ? { ...bad, error: bad.error.replace(/^Wrong PIN\./, "Your current PIN is wrong.") } : bad;
    }
  }
  await storePin(db, uid, String(pin).trim());
  return null;
}

/** Emails a 6-digit code that replaces a forgotten PIN. Returns { sentTo } or { error, status }. */
export async function sendPinResetCode(db, uid, email) {
  const snap = await pinRef(db, uid).get();
  if (!snap.exists) return { error: "You haven't set a PIN yet.", status: 409 };
  if (Date.now() - ms(snap.data().codeSentAt) < CODE_RESEND_MS) return { error: "A code was just sent. Wait a minute before asking for another.", status: 429 };
  if (!email) return { error: "Your account has no email to send a code to. Contact support.", status: 409 };
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
  await pinRef(db, uid).update({
    codeHash: await hashPin(code, fromB64(snap.data().salt)), codeExpires: Date.now() + CODE_TTL_MS, codeSentAt: Date.now(), codeTries: 0,
  });
  const res = await sendEmail(email, "Your StraWins PIN reset code", `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
      <h2 style="margin: 0 0 12px;">Reset your transaction PIN</h2>
      <p>Enter this code in StraWins to set a new 4-digit PIN:</p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px;">${code}</p>
      <p style="color: #777; font-size: 12px;">It works for 10 minutes. If you didn't ask for it, someone may know your password: change it in Settings.</p>
    </div>`);
  if (!res?.success) return { error: "We couldn't send the code. Please try again.", status: 502 };
  const [user, domain] = String(email).split("@");
  return { sentTo: `${user.slice(0, 2)}${"•".repeat(Math.max(3, user.length - 2))}@${domain}` };
}
