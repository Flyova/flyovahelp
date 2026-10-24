import { NextResponse } from "next/server";
import { getAdminDb, admin } from "@/lib/firebaseAdmin";
import { norm, isValidUsername, monthsSince } from "@/lib/chat";
import { getCaller } from "@/lib/apiAuth";

const unauthorized = () => NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });

// All three methods act on the signed-in account only. The uid comes from the
// verified ID token; any uid in the query/body is ignored (it used to be trusted,
// which let anyone create usernames on — and charge — someone else's wallet).

// GET /api/chat/usernames -> identities owned by the signed-in account
export async function GET(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return unauthorized();
    const uid = caller.uid;
    const db = getAdminDb();
    const snap = await db.collection("usernames").where("uid", "==", uid).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => !x.deleted);
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/chat/usernames { username } — first extra free, then $1 wallet.
// Accounts >8mo: 100 free. Agents: 5 free.
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
    if ((await db.collection("usernames").doc(lower).get()).exists)
      return NextResponse.json({ error: "Username taken" }, { status: 409 });

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    const u = userSnap.data();
    const owned = (await db.collection("usernames").where("uid", "==", uid).get()).size;
    const ageMonths = monthsSince(u.createdAt);
    const isAgent = !!(u.isAgent || (await db.collection("agents").doc(uid).get()).exists);
    const freeQuota = ageMonths >= 8 ? 100 : isAgent ? 5 : 0;
    const freeUsed = u.freeUsernameUsed === true || owned >= 1 + freeQuota;
    // Rule: one free create/change, everything after costs $1 (unless quota covers it)
    let charge = 0;
    if (freeQuota > 0 ? owned >= 1 + freeQuota : freeUsed) charge = 1;
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
        isDefault: owned === 0, createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
          type: "username_purchase", amount: -charge, username: lower,
          createdAt: admin.firestore.FieldValue.serverTimestamp(), note: `Username @${username}`,
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

// DELETE /api/chat/usernames { username } — permanently delete identity
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
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
