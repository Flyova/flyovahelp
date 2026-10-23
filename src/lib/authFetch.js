import { auth } from "@/lib/firebase";

/** fetch() + the signed-in user's ID token; resolves to the parsed JSON body ({ error } on failure). */
export async function authFetch(url, { method = "GET", body } = {}) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(url, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json().catch(() => ({ error: `Request failed (${res.status})` }));
}
