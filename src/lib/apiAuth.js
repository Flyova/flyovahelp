import { admin } from "@/lib/firebaseAdmin";

/** Verifies the `Authorization: Bearer <Firebase ID token>` header. Returns the decoded token or null. */
export async function getCaller(req) {
  const raw = String(req.headers.get("authorization") || "").trim();
  if (!raw.toLowerCase().startsWith("bearer ")) return null;
  try {
    return await admin.auth().verifyIdToken(raw.slice(7).trim());
  } catch {
    return null;
  }
}
