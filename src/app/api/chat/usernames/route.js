import { NextResponse } from "next/server";
import { getAdminDb, admin } from "@/lib/firebaseAdmin";
import { norm, isValidUsername, monthsSince, usernameCharge } from "@/lib/chat";
import { getCaller } from "@/lib/apiAuth";
import { moveAccountCoins } from "@/lib/coinWallets";
import { releasedUsernameCount, releaseUsername } from "@/lib/chatRelease";

const unauthorized = () => NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });

// All three methods act on the signed-in account only. The uid comes from the
// verified ID token; any uid in the query/body is ignored (it used to be trusted,
// which let anyone create usernames on — and charge — someone else's wallet).

// GET /api/chat/usernames -> { items, nextPrice }: the usernames the signed-in account can
// chat as (its own, plus other accounts' it has logged in to: `linked: true`), and
// what one more username would cost (0 = free). Also moves the old account-wide
// coin balance to the main username, the first time.
export async function GET(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return unauthorized();
    const uid = caller.uid;
    const db = getAdminDb();
    const [owned, linked] = await Promise.all([
      db.collection("usernames").where("uid", "==", uid).get(),
      db.collection("usernames").where("linkedUids", "array-contains", uid).get(),
    ]);
    const clean = (d, isLinked) => {
      const { linkedUids, ...data } = d.data(); // never hand out other accounts' ids
      return { id: d.id, ...data, linked: isLinked, otherAccounts: isLinked ? undefined : (linkedUids || []).length, ...(isLinked ? { isDefault: false, uid: undefined } : {}) };
    };
    const items = [
      ...owned.docs.filter((d) => !d.data().deleted).map((d) => clean(d, false)),
      ...linked.docs.filter((d) => !d.data().deleted && d.data().uid !== uid).map((d) => clean(d, true)),
    ];
    // Coins from before each username had its own wallet go to the main username.
    await moveAccountCoins(db, uid, items.find((i) => i.isDefault && !i.linked)?.id)
      .catch((e) => console.error("Moving account coins failed:", e));
    // What adding one more username costs, so the app can say "Add" (free) or "Buy $1".
    const [[userSnap, agentSnap], released] = await Promise.all([
      db.getAll(db.collection("users").doc(uid), db.collection("agents").doc(uid)),
      releasedUsernameCount(db, uid),
    ]);
    const u = userSnap.exists ? userSnap.data() : {};
    const nextPrice = usernameCharge({
      owned: owned.size + released, ageMonths: monthsSince(u.createdAt), isAgent: !!(u.isAgent || agentSnap.exists), freeUsernameUsed: u.freeUsernameUsed,
    });
    return NextResponse.json({ items, nextPrice });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/chat/usernames { username } — priced by usernameCharge (lib/chat): the
// first is free, then $1 from the wallet; accounts 8+ months old get 100 free, agents 5.
export async function POST(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return unauthorized();
    const uid = caller.uid;
    const { username } = await req.json();
    if (!isValidUsername(username))
      return NextResponse.json({ error: "Valid username (3-30 chars, letters/numbers/._) required" }, { status: 400 });
    const lower = norm(username);
    const db = getAdminDb();
    const existing = await db.collection("usernames").doc(lower).get();
    if (existing.exists && !existing.data().deleted)
      return NextResponse.json({ error: "Username taken" }, { status: 409 });
    // A deleted name not freed yet: free it now, then register it as new.
    if (existing.exists) await releaseUsername(db, lower);

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    const u = userSnap.data();
    const live = (await db.collection("usernames").where("uid", "==", uid).get()).size;
    const owned = live + (await releasedUsernameCount(db, uid)); // deleted names still count toward the price
    const isAgent = !!(u.isAgent || (await db.collection("agents").doc(uid).get()).exists);
    const charge = usernameCharge({ owned, ageMonths: monthsSince(u.createdAt), isAgent, freeUsernameUsed: u.freeUsernameUsed });
    // One transaction: the name check, a fresh balance check, the charge and the
    // records commit together, so two buyers can't both get a name and a
    // concurrent stake can't be overwritten by a stale wallet value.
    const nameRef = db.collection("usernames").doc(lower);
    const result = await db.runTransaction(async (tx) => {
      const [nameSnap, freshUser] = await Promise.all([tx.get(nameRef), tx.get(userRef)]);
      if (nameSnap.exists) return { status: 409, error: "Username taken" };
      if (charge > 0 && Number(freshUser.data()?.wallet || 0) < charge) {
        return { status: 402, error: "Insufficient wallet balance ($1 required)" };
      }

      tx.create(nameRef, {
        username: String(username).trim(), usernameLower: lower, uid,
        isDefault: live === 0, createdAt: admin.firestore.FieldValue.serverTimestamp(),
        pricePaid: charge, deleted: false,
      });
      tx.set(db.collection("chat_profiles").doc(lower), {
        username: String(username).trim(), uid, bio: "", status: "",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      if (charge > 0) {
        tx.update(userRef, {
          wallet: admin.firestore.FieldValue.increment(-charge),
          freeUsernameUsed: true,
        });
        tx.set(db.collection("users").doc(uid).collection("transactions").doc(), {
          type: "username_purchase", category: "finance", status: "completed", amount: -charge, username: lower,
          title: `Bought chat username @${lower}`, note: `Username @${username}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(), timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        tx.update(userRef, { freeUsernameUsed: true });
      }
      return null;
    });
    if (result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, charged: charge });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/chat/usernames { username } — permanently delete identity, then free the
// name for anyone to register (lib/chatRelease: its coins move to the main username,
// it leaves its groups, its private chats turn read-only for the other player)
export async function DELETE(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return unauthorized();
    const uid = caller.uid;
    const { username } = await req.json();
    const lower = norm(username);
    const db = getAdminDb();
    const ref = db.collection("usernames").doc(lower);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (snap.data().uid !== uid) return NextResponse.json({ error: "Not your username" }, { status: 403 });
    if (snap.data().isDefault) return NextResponse.json({ error: "Default username cannot be deleted" }, { status: 400 });
    await ref.update({ deleted: true, deletedAt: admin.firestore.FieldValue.serverTimestamp() });
    // If this stops half way, the name stays deleted and the daily cleanup finishes freeing it.
    await releaseUsername(db, lower).catch((e) => console.error(`Releasing @${lower} failed:`, e));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
