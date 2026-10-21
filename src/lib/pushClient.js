import { auth } from "@/lib/firebase";

// Fire-and-forget: asks the server to push the event to the mobile app. Never throws.
export async function notifyPush(payload) {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    await fetch("/api/push/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn("Push notify failed", e);
  }
}
