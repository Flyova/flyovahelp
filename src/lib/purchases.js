import { admin } from "@/lib/firebaseAdmin";

// What players buy with their main wallet besides games: chat usernames, account
// username changes and groups. Each one is also written to purchases/{id} (server
// only; admins read it on Admin → Purchases) in the same transaction as the charge.
//
//   { kind: "username" | "username_change" | "group", uid, amount (dollars, 0 = free),
//     free? (why a username cost nothing), username (the chat username bought, or the one
//     the group was made as), item (what was bought), convoId?, txId?, createdAt }
export const PURCHASE_KINDS = ["username", "username_change", "group"];

/** Adds the purchase record to transaction `tx`. */
export function recordPurchase(tx, db, { kind, uid, amount, free = null, username = "", item = "", convoId = null, txId = null }) {
  tx.set(db.collection("purchases").doc(), {
    kind, uid, amount: Number(amount) || 0, free, username, item, convoId, txId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}
