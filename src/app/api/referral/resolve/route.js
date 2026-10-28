import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { findReferrer } from "@/lib/referralCode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?code= -> { valid, uid, name }: a referral code, or (older links) a uid or username.
export async function GET(request) {
  try {
    const code = String(new URL(request.url).searchParams.get("code") || "").trim();
    if (!code) {
      return NextResponse.json({ valid: false });
    }
    const found = await findReferrer(getAdminDb(), code);
    if (!found) return NextResponse.json({ valid: false });
    return NextResponse.json({
      valid: true,
      uid: found.uid,
      name: found.user.fullName || found.user.username || "StraWins Member",
    });
  } catch (error) {
    console.error("Referral resolve error:", error);
    return NextResponse.json({ error: "Could not resolve referral code." }, { status: 500 });
  }
}
