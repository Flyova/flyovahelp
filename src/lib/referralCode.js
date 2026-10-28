// Short referral codes a player can type at sign-up ("Referral code") or share in
// a link (strawins.com/register?ref=CODE). users/{uid}.referralCode is the player's
// code and referral_codes/{CODE} = { uid } finds the player; both are written only
// by the server. Older links carry the referrer's uid or username, which still work.
import { FV, SIGNUP_REWARD } from "@/lib/money";
import { notifyUser } from "@/lib/notifications";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I to mix up
const LENGTH = 7;
export const REFERRAL_CODE = /^[A-HJ-NP-Z2-9]{7}$/;

const newCode = () => [...crypto.getRandomValues(new Uint32Array(LENGTH))].map((n) => ALPHABET[n % ALPHABET.length]).join("");

/** The player's referral code, made the first time it's asked for. */
export async function ensureReferralCode(db, uid, user) {
  if (REFERRAL_CODE.test(user?.referralCode || "")) return user.referralCode;
  const userRef = db.collection("users").doc(uid);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const codeRef = db.collection("referral_codes").doc(code);
    const made = await db.runTransaction(async (tx) => {
      const [u, c] = await tx.getAll(userRef, codeRef);
      if (REFERRAL_CODE.test(u.data()?.referralCode || "")) return u.data().referralCode; // made meanwhile
      if (c.exists) return null; // taken: try another
      tx.set(codeRef, { uid });
      tx.update(userRef, { referralCode: code });
      return code;
    });
    if (made) return made;
  }
  throw new Error("Couldn't make a referral code");
}

/** The uid a referral code, uid or (older links) username belongs to, with the account, or null. */
export async function findReferrer(db, code) {
  const value = String(code || "").trim();
  if (!value || value.includes("/")) return null;
  if (REFERRAL_CODE.test(value.toUpperCase())) {
    const snap = await db.collection("referral_codes").doc(value.toUpperCase()).get();
    const uid = snap.exists ? snap.data().uid : null;
    const user = uid ? await db.collection("users").doc(uid).get() : null;
    if (user?.exists) return { uid, user: user.data() };
  }
  const byUid = await db.collection("users").doc(value).get();
  if (byUid.exists) return { uid: byUid.id, user: byUid.data() };
  const byName = await db.collection("users").where("username", "==", value).limit(1).get();
  return byName.empty ? null : { uid: byName.docs[0].id, user: byName.docs[0].data() };
}

/**
 * Pays the referrer SIGNUP_REWARD when the player they referred verifies their email
 * (unverified sign-ups pay nothing), once per player: users/{uid}.signupRewardPaidTo.
 * The reward is counted in users/{referrer}.signupRewards. Never throws.
 */
export async function creditSignupReward(db, uid) {
  try {
    const userRef = db.collection("users").doc(uid);
    const first = (await userRef.get()).data();
    const referrerId = typeof first?.referrerUid === "string" ? first.referrerUid.trim() : "";
    if (!referrerId || referrerId === uid || first.signupRewardPaidTo) return;
    const referrerRef = db.collection("users").doc(referrerId);
    const paid = await db.runTransaction(async (tx) => {
      const [u, r] = await tx.getAll(userRef, referrerRef);
      if (!u.exists || !r.exists || u.data().signupRewardPaidTo) return false;
      tx.update(userRef, { signupRewardPaidTo: referrerId });
      tx.update(referrerRef, { signupRewards: FV().increment(1), signupRewardsTotal: FV().increment(1) });
      return true;
    });
    if (paid) {
      await notifyUser(db, referrerId, {
        type: "account", title: "New sign-up with your link",
        body: `${first.username ? `@${first.username}` : "A new player"} joined with your referral link: +$${SIGNUP_REWARD} sign-up reward.`,
        url: "/referrals", push: false,
      });
    }
  } catch (e) {
    console.error("Sign-up reward failed:", e?.message || e);
  }
}
