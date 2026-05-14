#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import admin from "firebase-admin";

const DRY_RUN = process.argv.includes("--dry-run");
const ROOT = process.cwd();

function loadEnvFromLocalFile() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    if (process.env[key]) continue;

    let value = match[2] ?? "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function initFirebaseAdmin() {
  loadEnvFromLocalFile();

  const projectId = requireEnv("FIREBASE_PROJECT_ID");
  const clientEmail = requireEnv("FIREBASE_CLIENT_EMAIL");
  const privateKey = requireEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  return admin.firestore();
}

function splitIntoChunks(items, chunkSize) {
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

async function run() {
  const db = initFirebaseAdmin();

  console.log(`Scanning users...${DRY_RUN ? " (dry-run)" : ""}`);
  const snap = await db.collection("users").get();
  const allUsers = snap.docs;

  const targets = allUsers.filter((docSnap) => {
    const data = docSnap.data() || {};
    return data.verified !== true || data.otp !== null;
  });

  console.log(`Total users: ${allUsers.length}`);
  console.log(`Users needing update: ${targets.length}`);

  if (targets.length === 0) {
    console.log("Nothing to update.");
    return;
  }

  if (DRY_RUN) {
    console.log("Dry run complete. No writes were made.");
    return;
  }

  const chunks = splitIntoChunks(targets, 450);
  let updated = 0;

  for (const [index, chunk] of chunks.entries()) {
    const batch = db.batch();
    for (const userDoc of chunk) {
      batch.update(userDoc.ref, {
        verified: true,
        otp: null,
      });
    }
    await batch.commit();
    updated += chunk.length;
    console.log(`Committed batch ${index + 1}/${chunks.length} (${updated}/${targets.length})`);
  }

  console.log(`Done. Updated ${updated} users to verified=true.`);
}

run().catch((err) => {
  console.error("verify-all-users failed:", err.message || err);
  process.exit(1);
});
