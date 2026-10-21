import { createRemoteJWKSet, jwtVerify } from "jose";
import { getServiceAccount, googleFetch } from "./credentials";

// firebase-admin–shaped Auth over Google's public token keys and the
// Identity Toolkit REST API. Error codes match firebase-admin's so existing
// `error.code === "auth/user-not-found"` checks keep working.

const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const IDT = "https://identitytoolkit.googleapis.com/v1";

let jwks = null;
const keys = () => (jwks ||= createRemoteJWKSet(new URL(JWKS_URL)));

function authError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

const IDT_ERRORS = {
  EMAIL_EXISTS: "auth/email-already-exists",
  DUPLICATE_EMAIL: "auth/email-already-exists",
  USER_NOT_FOUND: "auth/user-not-found",
  INVALID_EMAIL: "auth/invalid-email",
  INVALID_ID_TOKEN: "auth/invalid-id-token",
  WEAK_PASSWORD: "auth/invalid-password",
  DUPLICATE_LOCAL_ID: "auth/uid-already-exists",
};

async function idt(path, body) {
  const { projectId } = getServiceAccount();
  try {
    return await googleFetch(`${IDT}/projects/${projectId}/${path}`, { method: "POST", body });
  } catch (err) {
    const reason = String(err.googleMessage || "").split(/[ :]/)[0];
    throw authError(IDT_ERRORS[reason] || "auth/internal-error", err.googleMessage || err.message);
  }
}

function toUserRecord(u) {
  return {
    uid: u.localId,
    email: u.email,
    emailVerified: !!u.emailVerified,
    disabled: !!u.disabled,
    displayName: u.displayName,
    phoneNumber: u.phoneNumber,
    photoURL: u.photoUrl,
    customClaims: u.customAttributes ? JSON.parse(u.customAttributes) : undefined,
    metadata: {
      creationTime: u.createdAt ? new Date(Number(u.createdAt)).toUTCString() : undefined,
      lastSignInTime: u.lastLoginAt ? new Date(Number(u.lastLoginAt)).toUTCString() : undefined,
    },
  };
}

async function lookup(query) {
  const res = await idt("accounts:lookup", query);
  const user = res?.users?.[0];
  if (!user) throw authError("auth/user-not-found", "There is no user record corresponding to the provided identifier.");
  return toUserRecord(user);
}

function accountFields(props) {
  const body = {};
  if (props.email !== undefined) body.email = props.email;
  if (props.password !== undefined) body.password = props.password;
  if (props.emailVerified !== undefined) body.emailVerified = props.emailVerified;
  if (props.displayName !== undefined) body.displayName = props.displayName;
  if (props.phoneNumber !== undefined) body.phoneNumber = props.phoneNumber;
  if (props.photoURL !== undefined) body.photoUrl = props.photoURL;
  return body;
}

export const auth = {
  /** Verifies a Firebase ID token and returns its claims plus `uid`, like firebase-admin. */
  async verifyIdToken(idToken) {
    const { projectId } = getServiceAccount();
    if (typeof idToken !== "string" || !idToken) {
      throw authError("auth/argument-error", "An ID token must be a non-empty string.");
    }
    let payload;
    try {
      ({ payload } = await jwtVerify(idToken, keys(), {
        algorithms: ["RS256"],
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
      }));
    } catch (err) {
      const expired = err?.code === "ERR_JWT_EXPIRED";
      throw authError(expired ? "auth/id-token-expired" : "auth/argument-error", err?.message || "Invalid ID token.");
    }
    if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) {
      throw authError("auth/argument-error", "ID token has an invalid subject.");
    }
    if (typeof payload.auth_time === "number" && payload.auth_time > Math.floor(Date.now() / 1000) + 300) {
      throw authError("auth/argument-error", "ID token has an auth_time in the future.");
    }
    return { ...payload, uid: payload.sub };
  },

  getUser(uid) {
    return lookup({ localId: [uid] });
  },

  getUserByEmail(email) {
    return lookup({ email: [email] });
  },

  async createUser(props = {}) {
    const res = await idt("accounts", {
      ...accountFields(props),
      ...(props.uid ? { localId: props.uid } : {}),
      ...(props.disabled !== undefined ? { disabled: props.disabled } : {}),
    });
    return lookup({ localId: [res.localId] });
  },

  async updateUser(uid, props = {}) {
    await idt("accounts:update", {
      localId: uid,
      ...accountFields(props),
      ...(props.disabled !== undefined ? { disableUser: props.disabled } : {}),
    });
    return lookup({ localId: [uid] });
  },

  async deleteUser(uid) {
    await idt("accounts:delete", { localId: uid });
  },
};
