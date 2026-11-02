import { ROOM_ADMIN, norm, ownedUsername } from "@/lib/chat";

// Server side of the Chatroom's admin (ROOM_ADMIN in lib/chat). The dev server's local
// tests stand a throwaway username in for it (VITE_TEST_ROOM_ADMIN); builds never do.
export const roomAdminName = () => (import.meta.env.DEV && import.meta.env.VITE_TEST_ROOM_ADMIN) || ROOM_ADMIN;

/** The usernames/ doc when `uid` is chatting as the Chatroom's admin (and its owner is an admin), else null. */
export async function roomAdminAs(db, uid, as) {
  if (!as || norm(as) !== roomAdminName()) return null;
  const me = await ownedUsername(db, uid, as);
  if (!me) return null;
  const owner = await db.collection("users").doc(me.uid).get();
  return owner.exists && owner.data().role === "admin" ? me : null;
}
