import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { sendEmail } from "@/lib/resend";

export const runtime = "nodejs";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const normalizeOtp = (value) => String(value || "").replace(/\D/g, "").slice(0, 6);

async function getUserProfileByEmail(emailInput) {
  const adminDb = getAdminDb();
  const normalizedEmail = normalizeEmail(emailInput);
  if (!normalizedEmail) return null;

  try {
    const authUser = await admin.auth().getUserByEmail(normalizedEmail);
    const userRef = adminDb.collection("users").doc(authUser.uid);
    const userSnap = await userRef.get();
    if (userSnap.exists) {
      return { userRef, userData: userSnap.data(), uid: authUser.uid, email: normalizedEmail };
    }
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
  }

  const byEmailLowerSnap = await adminDb
    .collection("users")
    .where("emailLower", "==", normalizedEmail)
    .limit(1)
    .get();
  if (!byEmailLowerSnap.empty) {
    const row = byEmailLowerSnap.docs[0];
    return { userRef: row.ref, userData: row.data(), uid: row.id, email: normalizedEmail };
  }

  const candidates = Array.from(
    new Set([String(emailInput || "").trim(), normalizedEmail].filter(Boolean))
  );

  for (const email of candidates) {
    const byEmailSnap = await adminDb.collection("users").where("email", "==", email).limit(1).get();
    if (!byEmailSnap.empty) {
      const row = byEmailSnap.docs[0];
      return { userRef: row.ref, userData: row.data(), uid: row.id, email: normalizeEmail(row.data()?.email || email) };
    }
  }

  return null;
}

async function resendVerificationCode(emailInput) {
  const profile = await getUserProfileByEmail(emailInput);
  if (!profile) {
    return NextResponse.json({ error: "User record not found." }, { status: 404 });
  }

  if (profile.userData?.verified === true) {
    return NextResponse.json({
      ok: true,
      alreadyVerified: true,
      message: "This account is already verified. You can login.",
    });
  }

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  await profile.userRef.update({
    otp: otpCode,
    emailLower: profile.email,
    otpIssuedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const fullName = profile.userData?.fullName || profile.userData?.username || "Player";
  const emailResult = await sendEmail(
    profile.email,
    "Flyovahelp Verification Code",
    `<p>Hello ${fullName}, your verification code is <strong>${otpCode}</strong>.</p>`
  );

  if (!emailResult.success) {
    const message =
      typeof emailResult.error === "string"
        ? emailResult.error
        : emailResult.error?.message || "Could not send verification email.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: "A new 6-digit code has been sent to your email.",
  });
}

async function verifySubmittedCode(emailInput, otpInput) {
  const otp = normalizeOtp(otpInput);
  if (otp.length !== 6) {
    return NextResponse.json({ error: "Please enter the full 6-digit code." }, { status: 400 });
  }

  const profile = await getUserProfileByEmail(emailInput);
  if (!profile) {
    return NextResponse.json({ error: "User record not found." }, { status: 404 });
  }

  if (profile.userData?.verified === true) {
    return NextResponse.json({
      ok: true,
      alreadyVerified: true,
      message: "This account is already verified. You can login.",
    });
  }

  const storedOtp = String(profile.userData?.otp || "").trim();
  if (!storedOtp) {
    return NextResponse.json(
      { error: "No active verification code found. Please re-send code." },
      { status: 400 }
    );
  }

  if (storedOtp !== otp) {
    return NextResponse.json(
      { error: "The code you entered is incorrect. Please try again." },
      { status: 400 }
    );
  }

  await profile.userRef.update({
    verified: true,
    otp: null,
    emailLower: profile.email,
    verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}

export async function POST(request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const action = String(payload?.action || "").trim().toLowerCase();
    const email = normalizeEmail(payload?.email);

    if (!action) {
      return NextResponse.json({ error: "Action is required." }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    if (action === "status") {
      const profile = await getUserProfileByEmail(email);
      if (!profile) {
        return NextResponse.json({ ok: true, exists: false, verified: false, hasOtp: false });
      }
      return NextResponse.json({
        ok: true,
        exists: true,
        verified: profile.userData?.verified === true,
        hasOtp: Boolean(profile.userData?.otp),
      });
    }

    if (action === "resend") {
      return await resendVerificationCode(email);
    }

    if (action === "verify") {
      return await verifySubmittedCode(email, payload?.otp);
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    console.error("Verification API Error:", error);
    return NextResponse.json(
      { error: error?.message || "An error occurred. Please try again." },
      { status: 500 }
    );
  }
}
