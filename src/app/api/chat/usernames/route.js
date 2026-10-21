import { NextResponse } from "next/server";
import { getAdminDb, admin } from "@/lib/firebaseAdmin";
import { norm, isValidUsername, monthsSince } from "@/lib/chat";

// GET /api/chat/usernames?uid=... -> identities owned by account
export async function GET(req) {
  try {
    const uid = new URL(req.url).searchParams.get("uid");
    if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });
    const db = getAdminDb();
    const snap = await db.collection("usernames").where("uid", "==", uid).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => !x.deleted);
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/chat/usernames { uid, username } — first extra free, then $1 wallet.
// Accounts >8mo: 100 free. Agents: 5 free.
export async function POST(req) {
  try {
    const { uid, username } = await req.json();
    if (!uid || !isValidUsername(username))
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
    if (charge > 0 && (u.wallet || 0) < charge)
      return NextResponse.json({ error: "Insufficient wallet balance ($1 required)" }, { status: 402 });

    const batch = db.batch();
    batch.set(db.collection("usernames").doc(lower), {
      username: String(username).trim(), usernameLower: lower, uid,
      isDefault: owned === 0, createdAt: admin.firestore.FieldValue.serverTimestamp(),
      pricePaid: charge, deleted: false,
    });
    batch.set(db.collection("chat_profiles").doc(lower), {
      username: String(username).trim(), uid, bio: "", status: "",
      avatarUrl: "", coverUrl: "", updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    if (charge > 0) {
      batch.update(userRef, {
        wallet: (u.wallet || 0) - charge,
        freeUsernameUsed: true,
      });
      const tx = db.collection("users").doc(uid).collection("transactions").doc();
      batch.set(tx, {
        type: "username_purchase", amount: -charge, username: lower,
        createdAt: admin.firestore.FieldValue.serverTimestamp(), note: `Username @${username}`,
      });
    } else {
      batch.update(userRef, { freeUsernameUsed: true });
    }
    await batch.commit();
    return NextResponse.json({ ok: true, charged: charge });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/chat/usernames { uid, username } — permanently delete identity
export async function DELETE(req) {
  try {
    const { uid, username } = await req.json();
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
