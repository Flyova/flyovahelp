import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { DEVICE_ID, MAX_E2E_DEVICES, PUBLIC_KEY } from "@/lib/e2e";
import { e2eRulesLive } from "@/lib/e2eRules";

// Keys for end-to-end encrypted private chats (lib/e2e). Every browser or app
// install registers its public key here; its private key never leaves it. Kept in
// chat_devices/{uid} = { devices: { <deviceId>: { pub, platform, createdAt, lastSeen } } },
// which only this route reads and writes.
//
//   { action: "register", deviceId, pub, platform? } -> { ok }  each visit, which keeps the device fresh
//   { action: "devices", convoId }                    -> { e2e, devices: [{ id, pub }] }
//       a private chat you're in: whether it's encrypted, and every device to seal its
//       messages for (both sides, your own other devices too), without saying whose is whose.
//
// A private chat turns encrypted the first time every account in it has a device
// (conversations.e2e, set here) and stays that way: the rules then refuse plain text in it.
// Not before the published rules accept sealed messages (lib/e2eRules).

const FV = () => admin.firestore.FieldValue;
const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const CONVO_ID = /^[A-Za-z0-9_-]{1,128}$/;
const STALE_MS = 90 * 24 * 60 * 60 * 1000; // a device unused this long is dropped
const MAX_PER_ACCOUNT = 10;
const PLATFORMS = ["web", "android", "ios"];
// Local tests can run encrypted chats before the rules are published.
const rulesLive = async () => (import.meta.env.DEV && import.meta.env.VITE_TEST_E2E_RULES === "1") || e2eRulesLive();

const liveDevices = (snap, now) => Object.entries((snap.exists && snap.data().devices) || {})
  .filter(([id, d]) => DEVICE_ID.test(id) && PUBLIC_KEY.test(String(d?.pub || "")) && now - Number(d.lastSeen || 0) < STALE_MS);

async function register(db, caller, { deviceId, pub, platform }) {
  if (!DEVICE_ID.test(String(deviceId || "")) || !PUBLIC_KEY.test(String(pub || ""))) return fail("Bad device key.");
  const ref = db.collection("chat_devices").doc(caller.uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const devices = Object.fromEntries(liveDevices(snap, now));
    const same = devices[deviceId]?.pub === pub;
    devices[deviceId] = {
      pub,
      platform: PLATFORMS.includes(platform) ? platform : "web",
      createdAt: same ? Number(devices[deviceId].createdAt || now) : now,
      lastSeen: now,
    };
    // The most recently used ones, if an account somehow piles them up.
    const kept = Object.entries(devices).sort((a, b) => b[1].lastSeen - a[1].lastSeen).slice(0, MAX_PER_ACCOUNT);
    tx.set(ref, { devices: Object.fromEntries(kept), updatedAt: now });
  });
  return NextResponse.json({ ok: true });
}

async function devicesFor(db, caller, { convoId }) {
  if (!CONVO_ID.test(String(convoId || ""))) return fail("Chat not found.", 404);
  const ref = db.collection("conversations").doc(String(convoId));
  const snap = await ref.get();
  if (!snap.exists) return fail("Chat not found.", 404);
  const convo = snap.data();
  const uids = [...new Set(convo.participantUids || [])];
  if (!uids.includes(caller.uid)) return fail("You're not in this chat.", 403);
  if (convo.type === "group") return NextResponse.json({ e2e: false, devices: [] });

  const now = Date.now();
  const perAccount = (await db.getAll(...uids.map((u) => db.collection("chat_devices").doc(u)))).map((s) => liveDevices(s, now));
  let e2e = convo.e2e === true;
  if (!e2e && !convo.closed && perAccount.every((list) => list.length > 0) && await rulesLive()) {
    await ref.update({ e2e: true, e2eAt: FV().serverTimestamp() });
    e2e = true;
  }
  const devices = e2e
    ? perAccount.flat().map(([id, d]) => ({ id, pub: d.pub })).sort((a, b) => a.id.localeCompare(b.id)).slice(0, MAX_E2E_DEVICES)
    : [];
  return NextResponse.json({ e2e, devices });
}

const ACTIONS = { register, devices: devicesFor };

export async function POST(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const body = await req.json().catch(() => ({}));
    const run = Object.hasOwn(ACTIONS, body.action) ? ACTIONS[body.action] : null;
    if (!run) return fail("Unknown action.");
    return await run(getAdminDb(), caller, body);
  } catch (e) {
    console.error("Chat keys error:", e);
    return fail(e?.message || "Something went wrong.", 500);
  }
}
