import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { norm } from "@/lib/chat";
import { getCaller } from "@/lib/apiAuth";

// GET /api/chat/profile?u=username — the public profile shown when you tap a
// player in chat: chat username, bio and status, plus the name, country and
// join date that search already shows, and their chat coins only if they chose
// to show them off. Never email, phone, PIN or money balances.
export async function GET(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });
    const lower = norm(new URL(req.url).searchParams.get("u")).replace(/^@/, "");
    if (!lower) return NextResponse.json({ error: "Username required." }, { status: 400 });

    const db = getAdminDb();
    const nameSnap = await db.collection("usernames").doc(lower).get();
    const n = nameSnap.exists ? nameSnap.data() : null;
    if (!n || n.deleted || !n.uid) return NextResponse.json({ error: "This player no longer exists." }, { status: 404 });

    const [profileSnap, userSnap, stateSnap, coinSnap] = await db.getAll(
      db.collection("chat_profiles").doc(lower),
      db.collection("users").doc(n.uid),
      db.collection("chat_state").doc(n.uid),
      db.collection("coin_wallets").doc(n.uid),
    );
    const p = profileSnap.exists ? profileSnap.data() : {};
    const u = userSnap.exists ? userSnap.data() : {};
    const showCoins = stateSnap.exists && stateSnap.data().showCoins === true;
    return NextResponse.json({
      username: n.username || lower,
      usernameLower: lower,
      bio: p.bio || "",
      status: p.status || "",
      fullName: u.deleted || u.deletionRequested ? "" : u.fullName || "",
      country: u.country || "",
      memberSince: u.createdAt?.toMillis?.() ?? n.createdAt?.toMillis?.() ?? null,
      isYou: n.uid === caller.uid,
      coins: showCoins ? Math.max(0, Number(coinSnap.exists ? coinSnap.data().balance : 0) || 0) : null,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
