import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const adminDb = getAdminDb();
    const { uid, email, username, fullName, role, wallet, status, phone, dob, country, pin, isban } = await req.json();

    if (!uid) {
      return NextResponse.json({ error: "UID is required" }, { status: 400 });
    }

    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedUsername = String(username || "").trim();
    const normalizedPhone = String(phone || "").trim();
    const normalizedPin = String(pin || "").replace(/\D/g, "").slice(0, 8);
    const walletValue = Number(wallet);

    if (!normalizedPin || normalizedPin.length !== 8) {
      return NextResponse.json({ error: "Account PIN must be exactly 8 digits." }, { status: 400 });
    }

    // Enforce PIN uniqueness across all users except the current user.
    const pinConflictSnap = await adminDb
      .collection("users")
      .where("pin", "==", normalizedPin)
      .limit(2)
      .get();
    const pinConflictDoc = pinConflictSnap.docs.find((d) => d.id !== uid);
    if (pinConflictDoc) {
      return NextResponse.json(
        { error: `Account PIN ${normalizedPin} is already in use by another user.` },
        { status: 409 }
      );
    }

    // Enforce username uniqueness at API layer too.
    if (normalizedUsername) {
      const usernameConflictSnap = await adminDb
        .collection("users")
        .where("username", "==", normalizedUsername)
        .limit(2)
        .get();
      const usernameConflictDoc = usernameConflictSnap.docs.find((d) => d.id !== uid);
      if (usernameConflictDoc) {
        return NextResponse.json(
          { error: "This username is already taken by another account." },
          { status: 409 }
        );
      }
    }

    // 1. Update Firebase Authentication Email if provided
    if (normalizedEmail) {
      await admin.auth().updateUser(uid, {
        email: normalizedEmail,
      });
    }

    // 2. Update Firestore Document
    const userRef = adminDb.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const oldPin = userSnap.exists ? String(userSnap.data()?.pin || "") : "";

    // Track pin ownership metadata to make admin pin operations auditable.
    await adminDb.collection("pin_registry").doc(normalizedPin).set(
      {
        uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    if (oldPin && oldPin !== normalizedPin) {
      const oldPinRef = adminDb.collection("pin_registry").doc(oldPin);
      const oldPinSnap = await oldPinRef.get();
      if (oldPinSnap.exists && oldPinSnap.data()?.uid === uid) {
        await oldPinRef.delete();
      }
    }

    await userRef.update({
      email: normalizedEmail,
      username: normalizedUsername,
      fullName,
      role,
      wallet: Number.isFinite(walletValue) ? walletValue : 0,
      status,
      phone: normalizedPhone,
      dob: dob || "",
      country: country || "",
      pin: normalizedPin,
      isban: Boolean(isban)
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
