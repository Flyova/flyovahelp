import admin from "firebase-admin";
import { getDatabase } from "firebase-admin/database";

const firebaseAdminConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(firebaseAdminConfig),
      // ADDED: The URL for your Realtime Database instance
      databaseURL: "https://flyovahelp-f9331-default-rtdb.firebaseio.com/"
    });
    console.log("Firebase Admin Initialized with RTD");
  } catch (error) {
    console.error("Firebase Admin Init Error:", error.message);
  }
}

const adminDb = admin.firestore();

// Export all instances
export { adminDb, admin };
export const rtdb = getDatabase();