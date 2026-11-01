// A player's money today, this week, this month and this year (/api/wallet?view=activity):
// games (staked, won back, net, wins and losses), transfers, chat coins and usernames,
// withdrawals and deposits. Built from the records the History page shows: the player's
// transactions, their USDT deposits and withdrawals, and their trades with agents.
import { admin } from "@/lib/firebaseAdmin";
import { cents, toDollars } from "@/lib/money";
import { msOf, perPeriod, periodsOf } from "@/lib/periods";

// StraWins to Dollars settles a stake as a win (×1.3), a partial (92% back; 80% on
// older rows, which have no stakeAmount) or a loss (/api/cron/game-engine).
const STRAWINS_WIN = 1.3;
const STRAWINS_PARTIAL = 0.92;
const LEGACY_PARTIAL = 0.8;
// Enough for a very busy year; past it the totals say they're partial.
const MAX_RECORDS = 10000;

const abs = (v) => Math.abs(Number(v) || 0);

/**
 * What one transaction did in games: { stake, payout, outcome } in dollars, outcome
 * "win" | "loss" | null (not settled, or not known from this record), or null if it
 * isn't a game record. Older StraWins rows are read the way the History page reads them.
 */
export function gameMoney(t) {
  const title = String(t.title || "").replace(/^Flyova /, "StraWins ");
  if (title === "StraWins Stake") {
    const explicit = abs(t.stakeAmount);
    switch (t.status) {
      case "win": {
        const stake = explicit || abs(t.amount) / STRAWINS_WIN; // older rows hold the payout
        return { stake, payout: stake * STRAWINS_WIN, outcome: "win" };
      }
      case "partial": {
        const stake = explicit || abs(t.amount) / (1 - LEGACY_PARTIAL); // older rows hold the 20% lost
        return { stake, payout: stake * (explicit ? STRAWINS_PARTIAL : LEGACY_PARTIAL), outcome: "loss" };
      }
      case "refunded": // an older partial
        return { stake: abs(t.amount), payout: abs(t.amount) * LEGACY_PARTIAL, outcome: "loss" };
      case "loss":
        return { stake: explicit || abs(t.amount), payout: 0, outcome: "loss" };
      default: // pending, or "settled": the stake half of an older pair whose win is its own row
        return { stake: abs(t.amount), payout: 0, outcome: null };
    }
  }
  if (title === "StraWins Win") return { stake: 0, payout: abs(t.amount), outcome: "win" };
  if (title === "StraWins Partial Refund") return { stake: 0, payout: abs(t.amount), outcome: "loss" };
  if (t.type === "loss") return { stake: 0, payout: 0, outcome: "loss" }; // older outcome rows; the stake row has the money
  if (title === "Match Stake") return { stake: abs(t.amount), payout: 0, outcome: null };
  if (title === "Match Settlement") return { stake: 0, payout: abs(t.amount), outcome: null };
  if (t.type === "prediction") return { stake: 0, payout: 0, outcome: t.status === "loss" ? "loss" : null };
  if (t.type === "win") return { stake: 0, payout: abs(t.amount), outcome: "win" };
  if (t.type === "stake") return { stake: abs(t.amount), payout: 0, outcome: null }; // e.g. a Predict & Win plan
  return null;
}

const emptyTotals = () => ({
  games: { stakedC: 0, wonC: 0, wins: 0, losses: 0, jackpotsC: 0 },
  transfers: { sentC: 0, feesC: 0, sent: 0, receivedC: 0, received: 0 },
  chat: { coinsBoughtC: 0, coinsSoldC: 0, usernamesC: 0 },
  withdrawals: { count: 0, amountC: 0 },
  deposits: { count: 0, amountC: 0 },
});

/** Adds one transaction to a period's totals. */
function addTransaction(x, t) {
  const game = gameMoney(t);
  if (game) {
    x.games.stakedC += cents(game.stake);
    x.games.wonC += cents(game.payout);
    if (game.outcome === "win") x.games.wins += 1;
    if (game.outcome === "loss") x.games.losses += 1;
    return;
  }
  switch (t.type) {
    case "jackpot": x.games.jackpotsC += cents(abs(t.amount)); break;
    case "p2p_transfer":
      if (t.direction === "in") { x.transfers.receivedC += cents(abs(t.amount)); x.transfers.received += 1; }
      else { x.transfers.sentC += cents(abs(t.amount)); x.transfers.feesC += cents(abs(t.fee)); x.transfers.sent += 1; }
      break;
    case "coin_purchase": x.chat.coinsBoughtC += cents(abs(t.amount)); break;
    case "coin_withdrawal": x.chat.coinsSoldC += cents(abs(t.amount)); break;
    case "username_purchase": case "username_change": x.chat.usernamesC += cents(abs(t.amount)); break;
    default: break;
  }
}

const money = (c) => toDollars(c);
const finish = (x) => ({
  games: {
    staked: money(x.games.stakedC), won: money(x.games.wonC), net: money(x.games.wonC - x.games.stakedC),
    wins: x.games.wins, losses: x.games.losses, jackpots: money(x.games.jackpotsC),
  },
  transfers: { sent: money(x.transfers.sentC), sentCount: x.transfers.sent, fees: money(x.transfers.feesC), received: money(x.transfers.receivedC), receivedCount: x.transfers.received },
  chat: { coinsBought: money(x.chat.coinsBoughtC), coinsSold: money(x.chat.coinsSoldC), usernames: money(x.chat.usernamesC) },
  withdrawals: { count: x.withdrawals.count, amount: money(x.withdrawals.amountC) },
  deposits: { count: x.deposits.count, amount: money(x.deposits.amountC) },
});

/** { periods: { day|week|month|year: totals }, partial } for `uid`, with periods starting at `starts` (lib/periods). */
export async function playerActivity(db, uid, starts) {
  const userRef = db.collection("users").doc(uid);
  const since = admin.firestore.Timestamp.fromMillis(starts.year);
  // Equality filters only on the shared collections, so no extra indexes; the year is picked out here.
  const [txs, deposits, withdrawals, trades] = await Promise.all([
    userRef.collection("transactions").where("timestamp", ">=", since).limit(MAX_RECORDS)
      .select("title", "type", "status", "amount", "stakeAmount", "fee", "direction", "timestamp").get(),
    db.collection("deposits").where("userId", "==", uid).select("status", "amount", "processedAt", "createdAt").get(),
    db.collection("withdrawals").where("userId", "==", uid).select("status", "amount", "completedAt", "processedAt", "timestamp").get(),
    db.collection("trades").where("senderId", "==", uid).where("status", "==", "completed").select("type", "amount", "completedAt").get(),
  ]);
  const totals = perPeriod(emptyTotals);
  const add = (at, fn) => { for (const p of periodsOf(at, starts)) fn(totals[p]); };

  for (const d of txs.docs) add(msOf(d.data().timestamp), (x) => addTransaction(x, d.data()));
  for (const d of deposits.docs) {
    const r = d.data();
    if (r.status === "completed") add(msOf(r.processedAt) || msOf(r.createdAt), (x) => { x.deposits.count += 1; x.deposits.amountC += cents(abs(r.amount)); });
  }
  for (const d of withdrawals.docs) {
    const r = d.data();
    // An admin approves a USDT withdrawal ("approved"; some older ones say "completed").
    if (r.status === "approved" || r.status === "completed") {
      add(msOf(r.completedAt) || msOf(r.processedAt) || msOf(r.timestamp), (x) => { x.withdrawals.count += 1; x.withdrawals.amountC += cents(abs(r.amount)); });
    }
  }
  for (const d of trades.docs) {
    const r = d.data();
    const key = r.type === "deposit" ? "deposits" : r.type === "withdrawal" ? "withdrawals" : null;
    if (key) add(msOf(r.completedAt), (x) => { x[key].count += 1; x[key].amountC += cents(abs(r.amount)); });
  }
  return {
    periods: Object.fromEntries(Object.entries(totals).map(([p, x]) => [p, finish(x)])),
    partial: txs.docs.length >= MAX_RECORDS,
  };
}
