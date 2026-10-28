import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";
import { resolvePrivilegedRole } from "@/lib/adminAccess";
import { releaseAccountUsernames } from "@/lib/chatRelease";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_ROLES = new Set(["admin"]);

const parseBearerToken = (headerValue) => {
  const raw = String(headerValue || "").trim();
  if (!raw.toLowerCase().startsWith("bearer ")) return "";
  return raw.slice(7).trim();
};

const getAuthorizedRequester = async (request, adminDb) => {
  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) return { error: "Missing authorization token.", status: 401 };

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch (error) {
    console.error("Delete-user admin token verification failed:", error);
    return { error: "Invalid or expired authorization token.", status: 401 };
  }

  const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
  const userData = userSnap.exists ? userSnap.data() : {};
  const role = resolvePrivilegedRole(userData?.role, decoded.email);

  if (!role || !ADMIN_ROLES.has(role)) {
    return { error: "Administrative access required.", status: 403 };
  }

  return { uid: decoded.uid, email: decoded.email || "", role };
};

export async function POST(req) {
  try {
    const adminDb = getAdminDb();

    const requester = await getAuthorizedRequester(req, adminDb);
    if (requester.error) {
      return NextResponse.json({ error: requester.error }, { status: requester.status });
    }

    const { uid } = await req.json();

    if (!uid) {
      return NextResponse.json({ error: "UID is required" }, { status: 400 });
    }

    if (uid === requester.uid) {
      return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
    }

    // Only a deletion the player asked for and confirmed from their email (/api/account).
    const request = await adminDb.collection("deletion_requests").doc(uid).get();
    if (!request.exists || !request.data().emailConfirmedAt) {
      return NextResponse.json(
        { error: "This player hasn't confirmed the deletion from their email yet." },
        { status: 409 }
      );
    }

    // 1. Free their chat usernames: they leave their groups, their private chats
    //    are deleted, and the names can be registered again.
    await releaseAccountUsernames(adminDb, uid);

    // 2. Delete the Authentication Record (The part the user couldn't do)
    await admin.auth().deleteUser(uid);

    // 3. Delete the Firestore User Document
    await adminDb.collection("users").doc(uid).delete();

    // 4. Their history, notifications and inflow records, transaction PIN and referral code.
    const batch = adminDb.batch();
    for (const sub of ["transactions", "notifications", "inflow_bonus", "inflow_months"]) {
      const snap = await adminDb.collection("users").doc(uid).collection(sub).get();
      snap.forEach((doc) => batch.delete(doc.ref));
    }
    (await adminDb.collection("referral_codes").where("uid", "==", uid).get()).forEach((doc) => batch.delete(doc.ref));
    batch.delete(adminDb.collection("tx_pins").doc(uid));
    await batch.commit();
    await request.ref.update({ status: "completed", completedAt: admin.firestore.FieldValue.serverTimestamp() });

    return NextResponse.json({ message: "User deleted successfully from all systems" });
  } catch (error) {
    console.error("Admin Delete Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
