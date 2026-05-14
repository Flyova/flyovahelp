import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { STAFF_ADMIN_EMAIL, SUPPORT_ADMIN_EMAIL } from "@/lib/adminAccess";

export const runtime = "nodejs";

const normalize = (value) => String(value || "").trim().toLowerCase();

const STAFF_PASSWORD = process.env.STAFF_DASHBOARD_PASSWORD || "Flyovastaff@";
const SUPPORT_PASSWORD = process.env.SUPPORT_DASHBOARD_PASSWORD || "Flyovasupport@";

const privilegedCredentials = {
  [STAFF_ADMIN_EMAIL]: { role: "staff", password: STAFF_PASSWORD },
  [SUPPORT_ADMIN_EMAIL]: { role: "support", password: SUPPORT_PASSWORD },
};

export async function POST(req) {
  try {
    const payload = await req.json().catch(() => ({}));
    const email = normalize(payload.email);
    const password = String(payload.password || "").trim();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const account = privilegedCredentials[email];
    if (!account || password !== account.password) {
      return NextResponse.json({ error: "Invalid administrative credentials." }, { status: 401 });
    }

    let authUser;
    try {
      authUser = await admin.auth().getUserByEmail(email);
      await admin.auth().updateUser(authUser.uid, {
        password: account.password,
        emailVerified: true,
        disabled: false,
      });
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
      authUser = await admin.auth().createUser({
        email,
        password: account.password,
        emailVerified: true,
        disabled: false,
        displayName: "Portal Operator",
      });
    }

    const adminDb = getAdminDb();
    const userRef = adminDb.collection("users").doc(authUser.uid);
    const userSnap = await userRef.get();
    const existing = userSnap.exists ? userSnap.data() : {};
    const fallbackName = (email.split("@")[0] || "staff").replace(/[._-]+/g, " ").trim();

    await userRef.set(
      {
        uid: authUser.uid,
        email,
        username: existing?.username || email.split("@")[0] || "staff",
        fullName: existing?.fullName || fallbackName || "Portal Operator",
        role: account.role,
        status: "online",
        verified: true,
        isban: false,
        lastAdminLogin: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: existing?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, role: account.role });
  } catch (error) {
    console.error("Bootstrap Auth Error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not provision privileged account." },
      { status: 500 }
    );
  }
}
