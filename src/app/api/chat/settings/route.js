import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { isValidUsername, norm, ownedUsername } from "@/lib/chat";
import { CHAT_SETTING_DEFAULTS, chatSettingsFor } from "@/lib/chatSettings";

// Settings for each chat profile (username): read receipts, online status, hidden
// country, coins on show and message sounds. Stored in chat_settings/{username},
// which only this route writes; any account that can chat as the username (its
// owner, or an account logged in to it with its password) can read and change them.
//
//   GET                              -> { items: { [username]: settings } }  every username you can chat as
//   POST { username, settings }      -> { settings }  settings = any of { readReceipts, showOnline, hideCountry,
//                                       showCoins, sounds: { room, private, groups: { id: bool }, people: { name: bool } } }

const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const MAX_KEYS = 50;
const CONVO_ID = /^[A-Za-z0-9_-]{1,128}$/;

// Only known fields, as booleans.
function clean(input = {}) {
  const out = {};
  for (const k of Object.keys(CHAT_SETTING_DEFAULTS)) if (typeof input[k] === "boolean") out[k] = input[k];
  const s = input.sounds || {};
  const sounds = {};
  if (typeof s.room === "boolean") sounds.room = s.room;
  if (typeof s.private === "boolean") sounds.private = s.private;
  const groups = Object.entries(s.groups || {}).filter(([id, v]) => CONVO_ID.test(id) && typeof v === "boolean").slice(0, MAX_KEYS);
  if (groups.length) sounds.groups = Object.fromEntries(groups);
  const people = Object.entries(s.people || {})
    .map(([name, v]) => [norm(name), v])
    .filter(([name, v]) => isValidUsername(name) && typeof v === "boolean")
    .slice(0, MAX_KEYS);
  if (people.length) sounds.people = Object.fromEntries(people);
  if (Object.keys(sounds).length) out.sounds = sounds;
  return out;
}

export async function GET(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const db = getAdminDb();
    const [owned, linked] = await Promise.all([
      db.collection("usernames").where("uid", "==", caller.uid).get(),
      db.collection("usernames").where("linkedUids", "array-contains", caller.uid).get(),
    ]);
    const entries = [...owned.docs, ...linked.docs]
      .filter((d) => !d.data().deleted)
      .map((d) => ({ name: d.id, uid: d.data().uid }));
    const settings = await chatSettingsFor(db, entries);
    return NextResponse.json({ items: Object.fromEntries(settings) });
  } catch (e) {
    return fail(e?.message || "Something went wrong.", 500);
  }
}

export async function POST(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const body = await req.json().catch(() => ({}));
    const db = getAdminDb();
    const name = await ownedUsername(db, caller.uid, String(body.username || "").replace(/^@/, ""));
    if (!name) return fail("Choose one of your chat usernames.", 403);
    const patch = clean(body.settings);
    if (!Object.keys(patch).length) return fail("Nothing to change.");
    await db.collection("chat_settings").doc(name.lower).set(
      { ...patch, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
    const settings = await chatSettingsFor(db, [{ name: name.lower, uid: name.uid }]);
    return NextResponse.json({ settings: settings.get(name.lower) });
  } catch (e) {
    console.error("Chat settings error:", e);
    return fail(e?.message || "Something went wrong.", 500);
  }
}
