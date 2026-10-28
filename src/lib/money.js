// Wallet rules for the money API routes (/api/wallet, /api/trades, /api/game/*).
// Players' apps can't change balances any more (Firestore rules): every movement
// goes through one of those routes, which checks it against these. The same
// tables are in the app (src/lib/wallet.ts) for showing fees before you confirm.
import { admin } from "@/lib/firebaseAdmin";

export const MIN_DEPOSIT = 10; // USDT
export const MIN_WITHDRAWAL = 10; // USDT
export const MIN_AGENT_TRADE = 1; // deposits and withdrawals with a local agent
export const MIN_TRANSFER = 1;
export const MAX_AMOUNT = 1000000;
export const TRADE_EXPIRY_MS = 15 * 60 * 1000;
export const DEPOSIT_WINDOW_MS = 30 * 60 * 1000;
export const BONUS_REPAYMENT = 3;
export const USDT_NETWORK = "TRC20";
export const USDT_ADDRESS = "TNpj89XtibkLWcMCNMoe53PmcdAaGYv1nA";
export const ADMIN_NOTIFY_EMAIL = "arbie1877@gmail.com";

/** Agent commission on a trade, taken from the agent's own balance. */
export const AGENT_FEE_RATE = { deposit: 0.03, withdrawal: 0.05 };
/** Referrer's cut of a deposit: through an agent, or direct (USDT, approved by an admin). */
export const REFERRAL_COMMISSION = { agent: 0.035, direct: 0.015 };
export const MIN_QUALIFIED_REFERRALS = 10;
export const MIN_QUALIFYING_DEPOSIT = 25;

// `[minimum amount, fee]`, descending: the first tier the amount clears wins.
const WITHDRAWAL_FEE_TIERS = [
  [10001, 300], [5001, 170], [3001, 110], [2001, 88], [1501, 75],
  [1001, 60], [801, 52], [701, 48], [601, 42], [501, 35],
  [401, 30], [301, 25], [251, 22], [201, 18], [151, 15],
  [101, 12], [81, 9], [31, 6], [10, 3],
];
const TRANSFER_FEE_TIERS = [
  [10001, 50], [5001, 30], [2001, 25], [1001, 18], [851, 12],
  [501, 10], [251, 7], [81, 5], [51, 3], [16, 2], [1, 1],
];
const tierFee = (tiers, amount, min) => {
  if (!(amount >= min)) return 0;
  for (const [floor, fee] of tiers) if (amount >= floor) return fee;
  return 0;
};
/** USDT withdrawals only: withdrawing through a local agent is free. */
export const withdrawalFee = (amount) => tierFee(WITHDRAWAL_FEE_TIERS, amount, MIN_WITHDRAWAL);
export const transferFee = (amount) => tierFee(TRANSFER_FEE_TIERS, amount, MIN_TRANSFER);

// Balances are stored in dollars; sums are done in whole cents so they don't drift.
export const cents = (dollars) => Math.round(Number(dollars || 0) * 100);
export const toDollars = (c) => Math.round(c) / 100;
export const formatUsd = (dollars) => `$${Number(dollars || 0).toFixed(2)}`;

/** A requested amount in dollars (to the cent), or null if it isn't a usable one. */
export function parseAmount(value, { min = 0.01, max = MAX_AMOUNT } = {}) {
  const n = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = toDollars(cents(n));
  return rounded >= min && rounded <= max ? rounded : null;
}

export const isBanned = (u) => !!(u?.isban || u?.banned);

/** The $3 sign-up bonus is taken back on the first withdrawal or transfer. */
export const owesBonus = (u) => !!u?.bonusClaimed && !u?.bonusDeducted;

/** Withdrawals need a real full name: two or more words, none of them an initial. */
export function isValidAccountName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts.length >= 2 && parts.every((p) => p.replace(/\./g, "").length > 1);
}

const toMs = (ts) => (ts?.toMillis ? ts.toMillis() : ts?.toDate ? ts.toDate().getTime() : ts ? new Date(ts).getTime() : NaN);

/** When the account was made (ms): its createdAt, or (older accounts without one) its sign-in record; null if unknown. */
export async function accountCreatedMs(uid, user) {
  const ms = toMs(user?.createdAt);
  if (Number.isFinite(ms) && ms > 0) return ms;
  try {
    const made = Date.parse((await admin.auth().getUser(uid)).metadata.creationTime || "");
    return Number.isFinite(made) ? made : null;
  } catch {
    return null;
  }
}

/** Global switches admins set in settings/global (depositEnabled, withdrawalEnabled). */
export async function systemSettings(db) {
  const snap = await db.collection("settings").doc("global").get();
  return snap.exists ? snap.data() : {};
}

/** An agent players can trade with: approved and not banned. */
export const isTradingAgent = (a) => !!a && a.application_status === "approved" && a.banned !== true;

/**
 * The user who referred `user` (uid), or null. referrerUid is the current way;
 * older accounts only have referredBy, a username or full name.
 */
export async function referrerOf(db, userId, user) {
  const byUid = typeof user?.referrerUid === "string" ? user.referrerUid.trim() : "";
  if (byUid && byUid !== userId) {
    const snap = await db.collection("users").doc(byUid).get();
    if (snap.exists) return snap.id;
  }
  const label = typeof user?.referredBy === "string" ? user.referredBy.trim() : "";
  if (!label) return null;
  for (const field of ["username", "fullName"]) {
    const snap = await db.collection("users").where(field, "==", label).limit(1).get();
    if (!snap.empty && snap.docs[0].id !== userId) return snap.docs[0].id;
  }
  return null;
}

/** Whether a referred player has made a completed deposit of at least MIN_QUALIFYING_DEPOSIT. */
export async function hasQualifyingDeposit(db, uid) {
  const [trades, deposits] = await Promise.all([
    db.collection("trades").where("senderId", "==", uid).where("type", "==", "deposit").where("status", "==", "completed").get(),
    db.collection("deposits").where("userId", "==", uid).where("status", "==", "completed").get(),
  ]);
  return [...trades.docs, ...deposits.docs].some((d) => Number(d.data().amount || 0) >= MIN_QUALIFYING_DEPOSIT);
}

/** Players the account referred, by referrerUid and (older accounts) referredBy = its username or full name. */
export async function referralsOf(db, uid, user) {
  const found = new Map();
  const add = (snap) => snap.docs.forEach((d) => { if (d.id !== uid) found.set(d.id, d.data()); });
  add(await db.collection("users").where("referrerUid", "==", uid).get());
  for (const label of [user?.username, user?.fullName].filter(Boolean)) {
    add(await db.collection("users").where("referredBy", "==", label).get());
  }
  return found;
}

export const FV = () => admin.firestore.FieldValue;
