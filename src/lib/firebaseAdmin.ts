import admin from "firebase-admin";
import { getDatabase } from "firebase-admin/database";

const firebaseAdminConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  // Ensure the private key handles line breaks correctly
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(firebaseAdminConfig),
      databaseURL: "https://flyovahelp-f9331-default-rtdb.firebaseio.com"
    });
    console.log("✅ Firebase Admin Initialized");
  } catch (error) {
    console.error("❌ Firebase Admin Init Error:", error.message);
  }
}

const adminDb = admin.firestore();
// Use a function to get the DB instance to prevent top-level hanging
const getRtdb = () => getDatabase();

export { adminDb, admin, getRtdb };