import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

// Whether a username or phone number is already on an account, for sign-up and
// settings. Players can't query other accounts any more (Firestore rules), and
// this says only "taken" or not, never whose.
//
//   GET ?username=&phone= -> { usernameTaken, phoneTaken }

const taken = async (db, field, value) =>
  !!value && !(await db.collection("users").where(field, "==", value).limit(1).get()).empty;

export async function GET(req) {
  try {
    const params = new URL(req.url).searchParams;
    const username = String(params.get("username") || "").trim().slice(0, 60);
    const phone = String(params.get("phone") || "").trim().slice(0, 30);
    if (!username && !phone) return NextResponse.json({ error: "Nothing to check." }, { status: 400 });
    const db = getAdminDb();
    const [usernameTaken, phoneTaken] = await Promise.all([taken(db, "username", username), taken(db, "phone", phone)]);
    return NextResponse.json({ usernameTaken, phoneTaken });
  } catch (e) {
    console.error("Availability check error:", e);
    return NextResponse.json({ error: "Could not check that. Please try again." }, { status: 500 });
  }
}
