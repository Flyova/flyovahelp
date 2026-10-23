#!/usr/bin/env node
/**
 * One-off chat setup for existing data. Safe to re-run.
 *
 *   node scripts/backfill-chat.mjs           # preview: prints what would change, writes nothing
 *   node scripts/backfill-chat.mjs --apply   # writes the changes
 *
 * 1. Gives every player who has a profile `username` but no chat identity a default
 *    chat username (usernames/{lower} + chat_profiles/{lower}). Names that are
 *    invalid, too short, or already taken by another account are skipped and listed.
 *    This is the same "first username is free" identity they could claim in-app.
 * 2. Adds `participantUids` to conversations created before that field existed, so
 *    the Firestore rules let their members read them.
 *
 * Needs FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY (read from .env.local).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import admin from "firebase-admin";

const APPLY = process.argv.includes("--apply");
const USERNAME_RE = /^[a-z0-9._]{3,30}$/;

function loadEnvFromLocalFile() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let value = m[2] ?? "";
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[m[1]] = value;
  }
}

function initDb() {
  loadEnvFromLocalFile();
  for (const name of ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]) {
    if (!process.env[name]) throw new Error(`Missing env var: ${name} (add it to .env.local)`);
  }
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  }
  return admin.firestore();
}

/** Lowercase and drop characters chat usernames don't allow. */
const sanitize = (raw) => String(raw || "").trim().toLowerCase().replace(/^@/, "").replace(/[^a-z0-9._]/g, "").slice(0, 30);

async function backfillUsernames(db) {
  const [usersSnap, namesSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("usernames").get(),
  ]);

  const owners = new Map(); // lower -> uid
  const hasIdentity = new Set(); // uids that already own a chat username
  for (const d of namesSnap.docs) {
    owners.set(d.id, d.data().uid);
    if (!d.data().deleted) hasIdentity.add(d.data().uid);
  }

  const toCreate = [];
  const skipped = [];
  for (const u of usersSnap.docs) {
    if (hasIdentity.has(u.id)) continue;
    const data = u.data();
    if (data.deletionRequested || data.banned || data.isban) continue;
    const display = String(data.username || "").trim().replace(/^@/, "");
    const lower = sanitize(display);
    if (!display) continue; // no profile username to copy — they can claim one in-app
    if (!USERNAME_RE.test(lower)) {
      skipped.push(`${u.id}  "${display}"  → not a valid chat username`);
      continue;
    }
    const owner = owners.get(lower);
    if (owner && owner !== u.id) {
      skipped.push(`${u.id}  "${display}"  → @${lower} already belongs to another account`);
      continue;
    }
    owners.set(lower, u.id); // reserve within this run (two profiles with the same name)
    const pretty = /^[a-zA-Z0-9._]{3,30}$/.test(display) ? display : lower;
    toCreate.push({ uid: u.id, lower, username: pretty });
  }

  console.log(`\nChat usernames: ${usersSnap.size} players, ${hasIdentity.size} already have one.`);
  console.log(`  would create: ${toCreate.length}`);
  for (const c of toCreate.slice(0, 20)) console.log(`    @${c.lower}  (uid ${c.uid})`);
  if (toCreate.length > 20) console.log(`    … and ${toCreate.length - 20} more`);
  console.log(`  skipped: ${skipped.length}`);
  for (const s of skipped) console.log(`    ${s}`);

  if (!APPLY) return;
  const now = admin.firestore.FieldValue.serverTimestamp();
  let created = 0;
  for (const c of toCreate) {
    try {
      const batch = db.batch();
      // create() fails if someone claimed the name while this script was running.
      batch.create(db.collection("usernames").doc(c.lower), {
        username: c.username, usernameLower: c.lower, uid: c.uid,
        isDefault: true, createdAt: now, pricePaid: 0, deleted: false, backfilled: true,
      });
      batch.set(db.collection("chat_profiles").doc(c.lower), {
        username: c.username, uid: c.uid, bio: "", status: "", avatarUrl: "", coverUrl: "", updatedAt: now,
      }, { merge: true });
      await batch.commit();
      created += 1;
    } catch (e) {
      console.warn(`    could not create @${c.lower}: ${e.message}`);
    }
  }
  console.log(`  created: ${created}`);
}

async function backfillConversations(db) {
  const [convos, namesSnap] = await Promise.all([
    db.collection("conversations").get(),
    db.collection("usernames").get(),
  ]);
  const uidOf = new Map(namesSnap.docs.map((d) => [d.id, d.data().uid]));

  const updates = [];
  for (const c of convos.docs) {
    const data = c.data();
    if (Array.isArray(data.participantUids) && data.participantUids.length) continue;
    const uids = [...new Set((data.participants || []).map((p) => uidOf.get(String(p).toLowerCase())).filter(Boolean))];
    if (uids.length) updates.push({ ref: c.ref, uids });
  }

  console.log(`\nConversations: ${convos.size} total, ${updates.length} need participantUids.`);
  if (!APPLY) return;
  for (let i = 0; i < updates.length; i += 400) {
    const batch = db.batch();
    for (const u of updates.slice(i, i + 400)) batch.update(u.ref, { participantUids: u.uids });
    await batch.commit();
  }
  console.log(`  updated: ${updates.length}`);
}

const db = initDb();
console.log(APPLY ? "APPLY mode: writing changes." : "PREVIEW mode: nothing will be written. Re-run with --apply to write.");
await backfillUsernames(db);
await backfillConversations(db);
console.log("\nDone.");
process.exit(0);
