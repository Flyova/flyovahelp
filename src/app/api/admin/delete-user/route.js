import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";
import { resolvePrivilegedRole } from "@/lib/adminAccess";

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

    // 1. Delete the Authentication Record (The part the user couldn't do)
    await admin.auth().deleteUser(uid);

    // 2. Delete the Firestore User Document
    await adminDb.collection("users").doc(uid).delete();

    // 3. Optional: Delete their transactions sub-collection
    const txSnap = await adminDb.collection("users").doc(uid).collection("transactions").get();
    const batch = adminDb.batch();
    txSnap.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    return NextResponse.json({ message: "User deleted successfully from all systems" });
  } catch (error) {
    console.error("Admin Delete Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
