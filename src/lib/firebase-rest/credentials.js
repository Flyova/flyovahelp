import { importPKCS8, SignJWT } from "jose";

// Service-account auth for Google REST APIs, built on WebCrypto so it runs on
// Cloudflare Workers (firebase-admin needs gRPC and eval, which Workers forbids).

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = [
  "https://www.googleapis.com/auth/datastore",
  "https://www.googleapis.com/auth/firebase.database",
  "https://www.googleapis.com/auth/identitytoolkit",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/cloud-platform",
].join(" ");

export class FirebaseConfigError extends Error {}

export function getServiceAccount() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new FirebaseConfigError(
      "Firebase Admin environment variables are missing. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY."
    );
  }
  return { projectId, clientEmail, privateKey };
}

let cached = null; // { token, expiresAt }
let inflight = null;
let keyPromise = null;
let keySource = null;

async function signingKey(pem) {
  if (!keyPromise || keySource !== pem) {
    keySource = pem;
    keyPromise = importPKCS8(pem, "RS256");
  }
  return keyPromise;
}

async function fetchToken() {
  const { clientEmail, privateKey } = getServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: SCOPES })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(clientEmail)
    .setSubject(clientEmail)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(await signingKey(privateKey));

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`Google token exchange failed (${res.status}): ${json.error_description || json.error || "unknown"}`);
  }
  return { token: json.access_token, expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000 };
}

/** OAuth access token for the service account, cached until a minute before expiry. */
export async function getAccessToken() {
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
  if (!inflight) {
    inflight = fetchToken()
      .then((t) => (cached = t))
      .finally(() => (inflight = null));
  }
  return (await inflight).token;
}

/** fetch() with the service-account bearer token; parses JSON and throws on HTTP errors. */
export async function googleFetch(url, { method = "GET", body, headers } = {}) {
  const token = await getAccessToken();
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = new Error(json?.error?.message || `Google API ${method} ${url} failed (${res.status})`);
    err.status = res.status;
    err.googleStatus = json?.error?.status;
    err.googleMessage = json?.error?.message;
    throw err;
  }
  return json;
}
