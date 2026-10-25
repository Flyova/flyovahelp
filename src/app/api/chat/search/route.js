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
    const profiles = new Map(); // uid -> user document data
    const userHits = new Map(); // uid -> match
    for (const [snap, match] of [[byName, "name"], [byPhone, "phone"], [byCountry, "country"], [byReferrer, "referrer"]]) {
      for (const d of snap?.docs || []) {
        profiles.set(d.id, d.data());
        if (d.id !== caller.uid && !rows.has(d.id) && !userHits.has(d.id)) userHits.set(d.id, match);
      }
    }

    // Second round, in parallel: chat usernames for players matched by profile,
    // and profiles for players matched by chat username.
    const missing = [...rows.keys()].filter((uid) => !profiles.has(uid));
    const [owned, fetched] = await Promise.all([
      userHits.size ? safe(db.collection("usernames").where("uid", "in", [...userHits.keys()].slice(0, 30)).get()) : null,
      missing.length ? db.getAll(...missing.map((uid) => users.doc(uid))) : [],
    ]);
    for (const s of fetched) if (s.exists) profiles.set(s.id, s.data());
    for (const d of owned?.docs || []) {
      const n = d.data();
      const current = rows.get(n.uid);
      if (n.deleted || (current && !n.isDefault)) continue;
      rows.set(n.uid, { uid: n.uid, username: n.username || d.id, usernameLower: d.id, match: userHits.get(n.uid) });
    }

    // Players who hide their country (Chat settings) don't show it, and aren't found by it.
    const uids = [...rows.keys()];
    const states = uids.length ? await db.getAll(...uids.map((uid) => db.collection("chat_state").doc(uid))) : [];
    const hidesCountry = new Set(states.filter((s) => s.exists && s.data().hideCountry).map((s) => s.id));

    // Public profile fields only — any signed-in player can search, so never
    // return email, phone, dob, PIN, OTP or balances from the user document.
    const items = [...rows.values()]
      .filter((r) => {
        const u = profiles.get(r.uid) || {};
        return !u.deleted && !u.deletionRequested && !(r.match === "country" && hidesCountry.has(r.uid));
      })
      .sort((a, b) => MATCH_RANK[a.match] - MATCH_RANK[b.match] || a.usernameLower.length - b.usernameLower.length)
      .slice(0, LIMIT)
      .map((r) => {
        const u = profiles.get(r.uid) || {};
        return { id: r.usernameLower, ...r, fullName: u.fullName || "", country: hidesCountry.has(r.uid) ? "" : u.country || "" };
      });
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
