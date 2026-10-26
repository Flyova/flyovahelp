import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { sendPushToUsers } from "@/lib/push";
import {
  canPostInGroup, coinBuyQuote, coinWithdrawQuote, formatCents, formatCoins, isCoinAmount, liveUsername, ownedUsername,
  usernameUids, MAX_COINS_PER_ACTION,
} from "@/lib/chat";
import { activityRef, balanceOf, mainUsername, walletRef } from "@/lib/coinWallets";

// Chat coins. Each username has its own wallet, username_wallets/{username}, and
// each movement is logged in its activity (lib/coinWallets); both are server-only
// (Firestore rules: read the ones you can chat as, never write), so every change
// goes through here, inside one transaction. `as` is the username whose wallet is
// used (the account's main username if left out, as older apps do).
//
//   GET ?as=                                          -> { balance }
//   POST { action: "buy", as, coins }                 -> { balance }  main wallet pays value + 7% fee
//   POST { action: "withdraw", as, coins }            -> { balance }  value − 12% fee goes to the main wallet;
//                                                                    only the account that owns the username
//   POST { action: "send", as, to, coins, convoId? }  -> { balance }  free; in the Chatroom (no convoId)
//                                                                    or a group you're both in, where a coin card is posted

const FV = () => admin.firestore.FieldValue;
const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const amountError = `Choose between 1 and ${formatCoins(MAX_COINS_PER_ACTION)} coins.`;

const cents = (dollars) => Math.round(Number(dollars || 0) * 100);
const bannedUser = (u) => !!(u.isban || u.banned);

// The username a wallet action is for: `as` if the caller can chat as it, else
// (no `as`) their main username. Null if neither.
async function walletUsername(db, caller, as) {
  return ownedUsername(db, caller.uid, as || (await mainUsername(db, caller.uid)));
}

async function buy(db, caller, { as, coins }) {
  if (!isCoinAmount(coins)) return fail(amountError);
  const me = await walletUsername(db, caller, as);
  if (!me) return fail("Choose one of your chat usernames to buy coins for.", 403);
  const q = coinBuyQuote(coins);
  const userRef = db.collection("users").doc(caller.uid);
  const wallet = walletRef(db, me.lower);

  const out = await db.runTransaction(async (tx) => {
    const [userSnap, walletSnap] = await tx.getAll(userRef, wallet);
    if (!userSnap.exists) return { error: "Account not found.", status: 404 };
    if (bannedUser(userSnap.data())) return { error: "Your account can't buy coins.", status: 403 };
    if (cents(userSnap.data().wallet) < q.total) {
      return { error: `Not enough in your main balance: ${formatCents(q.total)} needed (including the ${formatCents(q.fee)} fee).`, status: 402 };
    }
    const balance = balanceOf(walletSnap) + coins;
    tx.update(userRef, { wallet: FV().increment(-q.total / 100) });
    tx.set(wallet, { balance, updatedAt: FV().serverTimestamp() }, { merge: true });
    tx.set(activityRef(db, me.lower), {
      kind: "buy", coins, cents: q.total, feeCents: q.fee, createdAt: FV().serverTimestamp(),
    });
    tx.set(userRef.collection("transactions").doc(), {
      type: "coin_purchase", category: "finance", status: "completed",
      title: `Bought ${formatCoins(coins)} chat coins for @${me.lower} (${formatCents(q.fee)} fee)`,
      amount: -q.total / 100, coins, fee: q.fee / 100, timestamp: FV().serverTimestamp(),
    });
    return { balance };
  });
  return out.error ? fail(out.error, out.status) : NextResponse.json({ balance: out.balance });
}

async function withdraw(db, caller, { as, coins }) {
  if (!isCoinAmount(coins)) return fail(amountError);
  const me = await walletUsername(db, caller, as);
  if (!me) return fail("Choose one of your chat usernames to withdraw from.", 403);
  // Coins turn into money in the caller's main balance, so only the owner can.
  if (!me.owned) return fail(`Only the account that owns @${me.lower} can withdraw its coins.`, 403);
  const q = coinWithdrawQuote(coins);
  const userRef = db.collection("users").doc(caller.uid);
  const wallet = walletRef(db, me.lower);

  const out = await db.runTransaction(async (tx) => {
    const [userSnap, walletSnap] = await tx.getAll(userRef, wallet);
    if (!userSnap.exists) return { error: "Account not found.", status: 404 };
    if (bannedUser(userSnap.data())) return { error: "Your account can't withdraw coins.", status: 403 };
    const have = balanceOf(walletSnap);
    if (have < coins) return { error: `You only have ${formatCoins(have)} coins.`, status: 402 };
    const balance = have - coins;
    tx.set(wallet, { balance, updatedAt: FV().serverTimestamp() }, { merge: true });
    tx.update(userRef, { wallet: FV().increment(q.payout / 100) });
    tx.set(activityRef(db, me.lower), {
      kind: "withdraw", coins, cents: q.payout, feeCents: q.fee, createdAt: FV().serverTimestamp(),
    });
    tx.set(userRef.collection("transactions").doc(), {
      type: "coin_withdrawal", category: "finance", status: "completed",
      title: `Withdrew ${formatCoins(coins)} chat coins from @${me.lower} (${formatCents(q.fee)} fee)`,
      amount: q.payout / 100, coins, fee: q.fee / 100, timestamp: FV().serverTimestamp(),
    });
    return { balance };
  });
  return out.error ? fail(out.error, out.status) : NextResponse.json({ balance: out.balance });
}

async function send(db, caller, { as, to, coins, convoId }) {
  if (!isCoinAmount(coins)) return fail(amountError);
  const me = await ownedUsername(db, caller.uid, as);
  if (!me) return fail("You can only send coins as one of your own usernames.", 403);
  const other = await liveUsername(db, to);
  if (!other) return fail("That player doesn't exist any more.", 404);
  // Not to your own usernames (nor ones you're logged in to): coins stay with the username they were bought for.
  if (usernameUids(other).includes(caller.uid)) return fail("You can't send coins to yourself.");

  const [userSnap, blockSnap] = await db.getAll(
    db.collection("users").doc(caller.uid),
    db.collection("chat_blocks").doc(`${other.lower}_${me.lower}`),
  );
  const user = userSnap.exists ? userSnap.data() : {};
  if (bannedUser(user)) return fail("Your account can't send coins.", 403);
  if (blockSnap.exists) return fail("You can't send coins to this player.", 403);

  // Where the coin card goes: a group you're both in, or the public chatroom.
  let msgRef;
  let convoRef = null;
  if (convoId) {
    convoRef = db.collection("conversations").doc(String(convoId));
    const convoSnap = await convoRef.get();
    const c = convoSnap.exists ? convoSnap.data() : null;
    if (!c || c.deleted || c.type !== "group") return fail("Coins can only be sent in the Chatroom or a group.", 400);
    const members = c.participants || [];
    if (!members.includes(me.lower) || !(c.participantUids || []).includes(caller.uid)) return fail("You're not in this group.", 403);
    if (!members.includes(other.lower)) return fail(`@${other.lower} isn't in this group.`, 400);
    if ((c.blocked || []).includes(me.lower)) return fail("You can't send messages in this group.", 403);
    if (!canPostInGroup(c, me.lower)) return fail("This group is locked. Only admins can send messages.", 403);
    msgRef = convoRef.collection("messages").doc();
  } else {
    if (user.chatMuted) return fail("You've been muted in the chatroom.", 403);
    msgRef = db.collection("chatroom_messages").doc();
  }

  const fromWallet = walletRef(db, me.lower);
  const toWallet = walletRef(db, other.lower);
  const text = `sent ${formatCoins(coins)} coin${coins === 1 ? "" : "s"} to @${other.lower}`;
  const out = await db.runTransaction(async (tx) => {
    const have = balanceOf(await tx.get(fromWallet));
    if (have < coins) return { error: `You only have ${formatCoins(have)} coins.`, status: 402 };
    const balance = have - coins;
    const now = FV().serverTimestamp();
    tx.set(fromWallet, { balance, updatedAt: now }, { merge: true });
    tx.set(toWallet, { balance: FV().increment(coins), updatedAt: now }, { merge: true });
    tx.set(activityRef(db, me.lower), { kind: "sent", coins, to: other.lower, from: me.lower, convoId: convoId || null, createdAt: now });
    tx.set(activityRef(db, other.lower), { kind: "received", coins, from: me.lower, to: other.lower, convoId: convoId || null, createdAt: now });
    tx.set(msgRef, {
      sender: me.lower, text, kind: "coins", coins, to: other.lower, createdAt: now, deletedForEveryone: false,
      ...(convoRef ? {} : { senderName: me.username || me.lower, senderUid: caller.uid, createdAtMs: Date.now() }),
    });
    if (convoRef) tx.update(convoRef, { lastMessage: `@${me.lower} ${text}`, lastMessageAt: now });
    tx.set(db.collection("notifications").doc(), {
      toUsername: other.lower, fromUsername: me.lower, kind: "coins", coins,
      title: `@${me.lower} sent you ${formatCoins(coins)} coins`, body: "Tap to see your coin wallet.",
      convoId: convoId || null, read: false, createdAt: now,
    });
    return { balance };
  });
  if (out.error) return fail(out.error, out.status);

  await sendPushToUsers([{ uid: other.uid, data: { url: convoId ? `/chat/${convoId}?as=${encodeURIComponent(other.lower)}` : "/chat" } }], {
    title: "You received coins",
    body: `@${me.lower} sent you ${formatCoins(coins)} coins`,
    data: { kind: "coins", convoId: convoId || null },
  }).catch(() => 0);
  return NextResponse.json({ balance: out.balance });
}

export async function GET(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const db = getAdminDb();
    const me = await walletUsername(db, caller, new URL(req.url).searchParams.get("as"));
    if (!me) return fail("Choose one of your chat usernames.", 403);
    const snap = await walletRef(db, me.lower).get();
    return NextResponse.json({ balance: balanceOf(snap) });
  } catch (e) {
    return fail(e?.message || "Something went wrong.", 500);
  }
}

const ACTIONS = { buy, withdraw, send };

export async function POST(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const body = await req.json().catch(() => ({}));
    const run = Object.hasOwn(ACTIONS, body.action) ? ACTIONS[body.action] : null;
    if (!run) return fail("Unknown action.");
    return await run(getAdminDb(), caller, { ...body, coins: Number(body.coins) });
  } catch (e) {
    console.error("Chat coins error:", e);
    return fail(e?.message || "Something went wrong.", 500);
  }
}
