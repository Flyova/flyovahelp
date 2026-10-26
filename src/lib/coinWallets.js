// Chat coin wallets, one per username: username_wallets/{usernameLower} = { balance },
// with each movement logged in username_wallets/{usernameLower}/activity. Server
// only (Firestore rules: anyone who can chat as the username reads it, nobody
// writes it); every change goes through /api/chat/coins or the helpers below.
//
// Coins used to be one wallet per account, coin_wallets/{uid}. That balance and
// its recent history move to the account's main username the first time its
// usernames are listed (moveAccountCoins).
import { admin } from "@/lib/firebaseAdmin";

const FV = () => admin.firestore.FieldValue;
const HISTORY_MOVED = 50; // account-wallet activity entries copied to the main username
const DELETE_CHUNK = 400;

export const walletRef = (db, name) => db.collection("username_wallets").doc(name);
export const activityRef = (db, name) => walletRef(db, name).collection("activity").doc();
export const balanceOf = (snap) => Math.max(0, Number(snap?.exists ? snap.data().balance : 0) || 0);

/** The account's main username (the one it got first, never deletable), or null. */
export async function mainUsername(db, uid) {
  if (!uid) return null;
  const snap = await db.collection("usernames").where("uid", "==", uid).get();
  const main = snap.docs.find((d) => d.data().isDefault && !d.data().deleted);
  return main ? main.id : null;
}

/** Moves the old per-account coin wallet (balance and recent activity) to `mainName`, once. */
export async function moveAccountCoins(db, uid, mainName) {
  if (!uid || !mainName) return;
  const legacy = db.collection("coin_wallets").doc(uid);
  const first = await legacy.get();
  if (!first.exists || first.data().movedTo) return;
  await db.runTransaction(async (tx) => {
    const [old, wallet] = await tx.getAll(legacy, walletRef(db, mainName));
    if (!old.exists || old.data().movedTo) return;
    const history = await tx.get(legacy.collection("activity").orderBy("createdAt", "desc").limit(HISTORY_MOVED));
    const coins = balanceOf(old);
    const now = FV().serverTimestamp();
    history.docs.forEach((d) => tx.set(walletRef(db, mainName).collection("activity").doc(d.id), d.data()));
    tx.set(legacy, { balance: 0, movedTo: mainName, updatedAt: now }, { merge: true });
    tx.set(walletRef(db, mainName), { balance: balanceOf(wallet) + coins, updatedAt: now }, { merge: true });
    if (coins > 0) tx.set(activityRef(db, mainName), { kind: "moved", coins, from: null, createdAt: now });
  });
}

/**
 * Empties a username's wallet before the name is freed for someone else: its
 * coins go to its owner's main username (kept on record in
 * username_wallets_released when there's none, e.g. the account was deleted),
 * then its wallet and activity are deleted. Call it while usernames/{name} still exists.
 */
export async function settleUsernameWallet(db, name) {
  const nameSnap = await db.collection("usernames").doc(name).get();
  const owner = nameSnap.exists ? nameSnap.data().uid : null;
  const main = await mainUsername(db, owner);
  const to = main && main !== name ? main : null;

  await db.runTransaction(async (tx) => {
    const [wallet, dest] = await tx.getAll(walletRef(db, name), ...(to ? [walletRef(db, to)] : []));
    const coins = balanceOf(wallet);
    if (coins <= 0) return;
    const now = FV().serverTimestamp();
    if (to) {
      tx.set(walletRef(db, to), { balance: balanceOf(dest) + coins, updatedAt: now }, { merge: true });
      tx.set(activityRef(db, to), { kind: "moved", coins, from: name, createdAt: now });
    } else {
      tx.set(db.collection("username_wallets_released").doc(), { name, uid: owner, coins, releasedAt: now });
    }
    tx.set(walletRef(db, name), { balance: 0, updatedAt: now }, { merge: true });
  });

  for (;;) {
    const page = await walletRef(db, name).collection("activity").limit(DELETE_CHUNK).get();
    if (page.empty) break;
    const batch = db.batch();
    page.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (page.size < DELETE_CHUNK) break;
  }
  await walletRef(db, name).delete();
}
