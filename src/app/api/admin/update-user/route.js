import { admin, adminDb } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { uid, email, username, fullName, role, wallet, status } = await req.json();

    if (!uid) {
      return NextResponse.json({ error: "UID is required" }, { status: 400 });
    }

    // 1. Update Firebase Authentication Email if provided
    if (email) {
      await admin.auth().updateUser(uid, {
        email: email,
      });
    }

    // 2. Update Firestore Document
    const userRef = adminDb.collection("users").doc(uid);
    await userRef.update({
      email,
      username,
      fullName,
      role,
      wallet: parseFloat(wallet),
      status
    });

    return NextResponse.json({ message: "User updated successfully in Auth and Firestore" });
  } catch (error) {
    console.error("Admin Update Error:", error);
    // Handle specific Firebase errors like email already in use
    if (error.code === 'auth/email-already-exists') {
        return NextResponse.json({ error: "This email is already registered with another account." }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}