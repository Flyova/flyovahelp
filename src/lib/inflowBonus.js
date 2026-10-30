// Inflow bonus: a cut of an account's own money activity, for accounts at least
// 8 months old (or that bought access for $250). It builds up in
// users/{uid}.inflowBonus (inflowEarned: everything ever earned), with each credit logged in users/{uid}/inflow_bonus/
// {category}_{source} so one deposit, trade or transfer is only ever counted once,
// and it moves to the main wallet on the 15th of each month (UTC) through /api/inflow.
//
// Credits run in their own transaction after the money has moved, so a problem
// here never holds up a deposit, trade or transfer.
import { addMonths } from "@/lib/accountPerks";
import { FV, accountCreatedMs, cents, toDollars, transferFee } from "@/lib/money";

export const INFLOW_MIN_AGE_MONTHS = 8;
export const INFLOW_ACCESS_PRICE = 250;
export const INFLOW_PAYOUT_DAY = 15;

/**
 * What earns the bonus: `rate` of the amount, once it's more than `above` or at least `from`,
 * and never more than `max(amount)` dollars. Transfers are capped at their fee: above $6,000
 * the 0.5% is more than the fee, so two accounts could otherwise profit from sending money
 * back and forth.
 */
export const INFLOW_CATEGORIES = {
  agent_deposit: { label: "Agent deposit trades", rate: 0.02, above: 99, text: "Agents earn 2% of every deposit they complete above $99." },
  deposit: { label: "Deposits", rate: 0.015, above: 99, text: "1.5% of every deposit you make above $99." },
  guess_scores: { label: "Guess scores", rate: 0.041, from: 4, text: "4.1% of every friends-game stake of $4 or more your referrals play." },
  transfer: { label: "Transfers", rate: 0.005, max: transferFee, text: "0.5% of every transfer you send. Above $6,000 it's the transfer's fee instead." },
  withdrawal: { label: "Withdrawals", rate: 0.001, text: "0.1% of every withdrawal you make." },
};

const qualifies = (c, base) => base > 0 && (c.above === undefined || base > c.above) && (c.from === undefined || base >= c.from);

/** { eligible, purchased, eligibleAt (ms or null) } for the account `uid` with data `user`. */
export async function inflowEligibility(uid, user) {
  const purchased = user?.inflowAccess === true;
  const made = await accountCreatedMs(uid, user);
  const eligibleAt = made ? addMonths(made, INFLOW_MIN_AGE_MONTHS) : null;
  return { eligible: purchased || (eligibleAt !== null && Date.now() >= eligibleAt), purchased, eligibleAt };
}

/** Whether today (UTC) is payout day. */
export const isPayoutDay = (now = new Date()) => now.getUTCDate() === INFLOW_PAYOUT_DAY;

/** The next payout day (UTC midnight, in ms): today if it's the 15th. */
export function nextPayoutMs(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), INFLOW_PAYOUT_DAY));
  if (now.getUTCDate() > INFLOW_PAYOUT_DAY) d.setUTCMonth(d.getUTCMonth() + 1);
  return d.getTime();
}

export const inflowRecords = (db, uid) => db.collection("users").doc(uid).collection("inflow_bonus");

/**
 * The admins' record of inflow money leaving or entering through the bonus itself:
 * payouts to the main wallet and $250 access purchases (inflow_ledger, Admin → Inflow).
 */
export const inflowLedger = (db) => db.collection("inflow_ledger");

/**
 * Credits `uid` the inflow bonus on `base` dollars of `category` activity, once per
 * `sourceId`, if the account is eligible. Returns the amount credited (0 if none).
 */
export async function creditInflow(db, { uid, category, base, sourceId, note = "" }) {
  const c = INFLOW_CATEGORIES[category];
  const amount = Number(base);
  if (!uid || !c || !sourceId || !qualifies(c, amount)) return 0;
  const fullC = Math.round(cents(amount) * c.rate);
  const creditC = c.max ? Math.min(fullC, cents(c.max(amount))) : fullC;
  if (creditC <= 0) return 0;
  const userRef = db.collection("users").doc(uid);
  const recordRef = inflowRecords(db, uid).doc(`${category}_${sourceId}`);
  return db.runTransaction(async (tx) => {
    const [user, record] = await tx.getAll(userRef, recordRef);
    if (!user.exists || record.exists) return 0;
    if (!(await inflowEligibility(uid, user.data())).eligible) return 0;
    const credit = toDollars(creditC);
    const now = FV().serverTimestamp();
    tx.update(userRef, { inflowBonus: FV().increment(credit), inflowEarned: FV().increment(credit) });
    const capped = creditC < fullC ? "capped at the transfer's fee" : "";
    tx.set(recordRef, { category, rate: c.rate, base: amount, amount: credit, sourceId, note: [note, capped].filter(Boolean).join(" · "), createdAt: now });
    return credit;
  });
}

/** creditInflow for the routes: logs a failure instead of throwing. */
export const creditInflowSafely = (db, credit) =>
  creditInflow(db, credit).catch((e) => {
    console.error(`Inflow bonus (${credit.category} ${credit.sourceId}) failed:`, e);
    return 0;
  });
