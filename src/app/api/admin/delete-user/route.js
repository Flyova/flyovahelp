import { admin, adminDb } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { uid } = await req.json();

    if (!uid) {
      return NextResponse.json({ error: "UID is required" }, { status: 400 });
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