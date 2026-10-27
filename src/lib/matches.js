// "Play with friends" matches (games/{id}). Both players stake 15 rounds' worth plus a
// 25% fee when the challenge is accepted (/api/game/match); the stakes are recorded on
// the server-only match_escrow/{gameId}, and a match can never pay out more than they
// add up to, whatever the players' apps wrote into its wagerPool while playing.
import { FV, cents, toDollars } from "@/lib/money";

export const ROUNDS_PER_PLAYER = 15;
export const MATCH_ADMIN_FEE_RATE = 0.25;
export const MAX_STAKE_PER_ROUND = 10000;
export const HEAD_TO_HEAD_WIN_CAP = 15;

/** What each player pays to play at `stakePerRound` (whole dollars), or null if it isn't a valid stake. */
export function matchCost(stakePerRound) {
  const stake = Number(stakePerRound);
  if (!Number.isInteger(stake) || stake < 1 || stake > MAX_STAKE_PER_ROUND) return null;
  const totalWager = stake * ROUNDS_PER_PLAYER;
  const fee = toDollars(cents(stake) * MATCH_ADMIN_FEE_RATE);
  return { stakePerRound: stake, totalWager, fee, totalCost: toDollars(cents(totalWager) + cents(fee)) };
}

export const escrowRef = (db, gameId) => db.collection("match_escrow").doc(gameId);

/**
 * Pays a completed match's wagerPool to its players and removes it (and its escrow),
 * capped at the escrowed stakes. Matches from before escrow fall back to their own
 * stakePerRound. Returns { p1, p2 } paid, or null if there was nothing to settle.
 */
export async function settleMatch(db, gameId) {
  const gameRef = db.collection("games").doc(gameId);
  return db.runTransaction(async (tx) => {
    const [snap, escrow] = await tx.getAll(gameRef, escrowRef(db, gameId));
    if (!snap.exists) return null;
    const game = snap.data() || {};
    if (game.status !== "completed") return null;
    const perPlayer = escrow.exists ? Number(escrow.data().totalWager) : Number(game.stakePerRound || 0) * ROUNDS_PER_PLAYER;
    const potC = Math.max(0, cents(perPlayer) * 2);
    const p1C = Math.min(potC, Math.max(0, cents(game.wagerPool?.p1)));
    const p2C = Math.min(potC - p1C, Math.max(0, cents(game.wagerPool?.p2)));
    const now = FV().serverTimestamp();
    for (const [uid, amountC] of [[game.player1, p1C], [game.player2, p2C]]) {
      if (!uid || amountC <= 0) continue;
      const userRef = db.collection("users").doc(uid);
      tx.update(userRef, { wallet: FV().increment(toDollars(amountC)) });
      tx.set(userRef.collection("transactions").doc(), {
        title: "Match Settlement", amount: toDollars(amountC), type: "finance", status: "win", timestamp: now,
      });
    }
    tx.delete(gameRef);
    if (escrow.exists) tx.delete(escrow.ref);
    return { p1: toDollars(p1C), p2: toDollars(p2C) };
  });
}
