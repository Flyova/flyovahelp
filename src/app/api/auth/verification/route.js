import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { sendEmail } from "@/lib/resend";
import { creditSignupReward } from "@/lib/referralCode";

export const runtime = "nodejs";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

// The current code for an account is kept on email_codes/{uid}, which only the
// server can read (it used to be users/{uid}.otp, readable by the player, so an
// account could verify itself). Accounts made before that still have `otp` on
// their user doc until a new code is sent.
const MAX_TRIES = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
const codeRef = (uid) => getAdminDb().collection("email_codes").doc(uid);
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

  const current = (await codeRef(profile.uid).get()).data();
  const sinceLast = Date.now() - Number(current?.issuedAt || 0);
  if (sinceLast < RESEND_COOLDOWN_MS) {
    return NextResponse.json(
      { error: `Please wait ${Math.ceil((RESEND_COOLDOWN_MS - sinceLast) / 1000)}s before requesting another code.` },
      { status: 429 }
    );
  }

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  await codeRef(profile.uid).set({ code: otpCode, issuedAt: Date.now(), tries: 0 });
  await profile.userRef.update({
    otp: admin.firestore.FieldValue.delete(),
    emailLower: profile.email,
    otpIssuedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const fullName = profile.userData?.fullName || profile.userData?.username || "Player";
  const emailResult = await sendEmail(
    profile.email,
    "StraWins Verification Code",
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

  const saved = (await codeRef(profile.uid).get()).data();
  const storedOtp = String(saved?.code || profile.userData?.otp || "").trim();
  if (!storedOtp) {
    return NextResponse.json(
      { error: "No active verification code found. Please re-send code." },
      { status: 400 }
    );
  }

  if (storedOtp !== otp) {
    // A few wrong guesses use the code up, so it can't be guessed.
    const tries = Number(saved?.tries || 0) + 1;
    if (tries >= MAX_TRIES) {
      await codeRef(profile.uid).delete();
      return NextResponse.json(
        { error: "Too many incorrect codes. Please re-send a new code." },
        { status: 400 }
      );
    }
    if (saved) {
      await codeRef(profile.uid).update({ tries });
    } else {
      // An older account's code moves off its user doc on the first wrong try.
      await codeRef(profile.uid).set({ code: storedOtp, issuedAt: 0, tries });
      await profile.userRef.update({ otp: admin.firestore.FieldValue.delete() });
    }
    return NextResponse.json(
      { error: "The code you entered is incorrect. Please try again." },
      { status: 400 }
    );
  }

  await codeRef(profile.uid).delete();
  await profile.userRef.update({
    verified: true,
    otp: admin.firestore.FieldValue.delete(),
    emailLower: profile.email,
    verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await creditSignupReward(getAdminDb(), profile.uid);

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
        hasOtp: Boolean(profile.userData?.otp) || (await codeRef(profile.uid).get()).exists,
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
