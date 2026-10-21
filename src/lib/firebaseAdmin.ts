import { auth } from "./firebase-rest/auth";
import { Database } from "./firebase-rest/database";
import { FieldValue, Firestore, Timestamp } from "./firebase-rest/firestore";

// Server-side Firebase for Cloudflare Workers. firebase-admin cannot run on
// Workers (its Firestore client needs gRPC and runtime code generation), so this
// is a REST-backed replacement with the same surface the API routes use:
//   admin.auth().verifyIdToken / getUserByEmail / createUser / updateUser / deleteUser
//   admin.firestore.FieldValue / admin.firestore.Timestamp
//   getAdminDb() -> Firestore, getRtdb() -> Realtime Database
// Credentials come from FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.

const DATABASE_URL = "https://flyovahelp-f9331-default-rtdb.firebaseio.com";

let firestore: Firestore | null = null;
let rtdb: Database | null = null;

const getAdminDb = () => (firestore ??= new Firestore());

const getRtdb = () => (rtdb ??= new Database(DATABASE_URL));

const admin = {
  firestore: Object.assign(() => getAdminDb(), { FieldValue, Timestamp }),
  auth: () => auth,
  database: () => getRtdb(),
};

export { admin, getAdminDb, getRtdb };
