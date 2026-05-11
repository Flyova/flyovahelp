import admin from "firebase-admin";
import { getDatabase } from "firebase-admin/database";

const firebaseAdminConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  // Ensure the private key handles line breaks correctly
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

function hasRequiredAdminEnv() {
  return Boolean(
    firebaseAdminConfig.projectId &&
    firebaseAdminConfig.clientEmail &&
    firebaseAdminConfig.privateKey
  );
}

function ensureAdminApp() {
  if (admin.apps.length) return admin.app();

  if (!hasRequiredAdminEnv()) {
    throw new Error(
      "Firebase Admin environment variables are missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY."
    );
  }

  return admin.initializeApp({
    credential: admin.credential.cert(firebaseAdminConfig),
    databaseURL: "https://flyovahelp-f9331-default-rtdb.firebaseio.com",
  });
}

const getAdminDb = () => {
  ensureAdminApp();
  return admin.firestore();
};

const getRtdb = () => {
  ensureAdminApp();
  return getDatabase();
};

export { admin, getAdminDb, getRtdb };
