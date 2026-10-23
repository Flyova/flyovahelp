import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { norm } from "@/lib/chat";
import { getCaller } from "@/lib/apiAuth";

// GET /api/chat/search?q=... — username, name, phone, country, referrer code
export async function GET(req) {
  try {
    if (!(await getCaller(req))) return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });
    const q = norm(new URL(req.url).searchParams.get("q"));
    if (!q || q.length < 2) return NextResponse.json({ items: [] });
    const db = getAdminDb();
    const out = new Map();
    // Public profile fields only — any signed-in player can search, so never
    // return email, phone, dob, PIN, OTP or balances from the user document.
    const push = (d, kind) => {
      const data = d.data() || {};
      if (out.has(d.id) || data.deleted) return;
      out.set(d.id, {
        kind,
        id: d.id,
        uid: data.uid || d.id,
        username: data.username || "",
        usernameLower: data.usernameLower || "",
        fullName: data.fullName || "",
        country: data.country || "",
      });
    };
    // username identities
    const un = await db.collection("usernames").where("usernameLower", ">=", q)
      .where("usernameLower", "<=", q + "\uf8ff").limit(10).get();
    un.docs.forEach((d) => push(d, "username"));
    // users by username / phone / name / country / referrer
    for (const [field, op, val] of [
      ["username", "==", q], ["phone", "==", q],
    ]) {
      try {
        const s = await db.collection("users").where(field, op, val).limit(10).get();
        s.docs.forEach((d) => push(d, "user"));
      } catch { /* missing index — skip */ }
    }
    const all = await db.collection("users").limit(200).get();
    all.docs.forEach((d) => {
      const u = d.data();
      const hay = `${u.username || ""} ${u.fullName || ""} ${u.phone || ""} ${u.country || ""} ${u.referrerUid || ""} ${d.id || ""}`.toLowerCase();
      if (hay.includes(q)) push(d, "user");
    });
    return NextResponse.json({ items: [...out.values()].slice(0, 20) });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
