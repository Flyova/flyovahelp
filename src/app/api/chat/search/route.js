import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { norm } from "@/lib/chat";
import { getCaller } from "@/lib/apiAuth";

const LIMIT = 8;
const END = "";
const MATCH_RANK = { exact: 0, username: 1, name: 2, phone: 3, country: 4, referrer: 5 };
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase());

// GET /api/chat/search?q=... — live suggestions while typing (2+ characters).
// Chat usernames match by prefix; players match by name prefix, phone prefix,
// country or referrer and are shown under the chat username you can message.
// Indexed queries only: this runs on every (debounced) keystroke.
export async function GET(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });
    const raw = String(new URL(req.url).searchParams.get("q") || "").trim().replace(/^@/, "").slice(0, 60);
    const q = norm(raw);
    if (q.length < 2) return NextResponse.json({ items: [] });

    const db = getAdminDb();
    const users = db.collection("users");
    const prefix = (ref, field, value, n) => ref.where(field, ">=", value).where(field, "<=", value + END).limit(n).get();
    const variants = [...new Set([raw, q, titleCase(raw), raw.toUpperCase()])];
    const digits = raw.replace(/\D/g, "");
    const looksLikePhone = /^\+?[\d\s()-]+$/.test(raw) && digits.length >= 3; // "+234" is enough
    // A failing query (e.g. a missing index) shouldn't sink the others.
    const safe = (p) => p.catch(() => null);

    const [names, byName, byPhone, byCountry, byReferrer] = await Promise.all([
      safe(prefix(db.collection("usernames"), "usernameLower", q, LIMIT * 2)),
      safe(prefix(users, "fullName", titleCase(raw), 5)),
      looksLikePhone ? safe(prefix(users, "phone", `+${digits}`, 5)) : null,
      safe(users.where("country", "in", variants).limit(5).get()),
      safe(users.where("referredBy", "in", variants).limit(5).get()),
    ]);

    // One row per player, under the chat username that matched (or their default one).
    const rows = new Map(); // uid -> row
    for (const d of names?.docs || []) {
      const n = d.data();
      if (n.deleted || !n.uid || n.uid === caller.uid || rows.has(n.uid)) continue;
      rows.set(n.uid, {
        uid: n.uid, username: n.username || d.id, usernameLower: d.id,
        match: d.id === q ? "exact" : "username",
      });
    }
    const userHits = new Map(); // uid -> match
    for (const [snap, match] of [[byName, "name"], [byPhone, "phone"], [byCountry, "country"], [byReferrer, "referrer"]]) {
      for (const d of snap?.docs || []) {
        if (d.id !== caller.uid && !rows.has(d.id) && !userHits.has(d.id)) userHits.set(d.id, match);
      }
    }
    if (userHits.size) {
      const owned = await safe(db.collection("usernames").where("uid", "in", [...userHits.keys()].slice(0, 30)).get());
      for (const d of owned?.docs || []) {
        const n = d.data();
        const current = rows.get(n.uid);
        if (n.deleted || (current && !n.isDefault)) continue;
        rows.set(n.uid, { uid: n.uid, username: n.username || d.id, usernameLower: d.id, match: userHits.get(n.uid) });
      }
    }

    const ranked = [...rows.values()]
      .sort((a, b) => MATCH_RANK[a.match] - MATCH_RANK[b.match] || a.usernameLower.length - b.usernameLower.length)
      .slice(0, LIMIT);

    // Public profile fields only — any signed-in player can search, so never
    // return email, phone, dob, PIN, OTP or balances from the user document.
    const profiles = ranked.length ? await db.getAll(...ranked.map((r) => users.doc(r.uid))) : [];
    const items = ranked
      .map((r, i) => {
        const u = profiles[i]?.exists ? profiles[i].data() : {};
        if (u.deleted || u.deletionRequested) return null;
        return { id: r.usernameLower, ...r, fullName: u.fullName || "", country: u.country || "" };
      })
      .filter(Boolean);
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
