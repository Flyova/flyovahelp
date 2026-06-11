import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const code = String(new URL(request.url).searchParams.get("code") || "").trim();
    if (!code) {
      return NextResponse.json({ valid: false });
    }

    const adminDb = getAdminDb();

    // Current scheme: referral links carry the referrer's uid.
    const uidSnap = await adminDb.collection("users").doc(code).get();
    if (uidSnap.exists) {
      const d = uidSnap.data();
      return NextResponse.json({
        valid: true,
        uid: uidSnap.id,
        name: d.fullName || d.username || "Flyova Member",
      });
    }

    // Legacy fallback: older links shared a username instead of a uid.
    const usernameSnap = await adminDb
      .collection("users")
      .where("username", "==", code)
      .limit(1)
      .get();
    if (!usernameSnap.empty) {
      const refDoc = usernameSnap.docs[0];
      const d = refDoc.data();
      return NextResponse.json({
        valid: true,
        uid: refDoc.id,
        name: d.fullName || d.username || "Flyova Member",
      });
    }

    return NextResponse.json({ valid: false });
  } catch (error) {
    console.error("Referral resolve error:", error);
    return NextResponse.json({ error: "Could not resolve referral code." }, { status: 500 });
  }
}
