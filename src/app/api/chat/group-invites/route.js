import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { groupInvitesFor } from "@/lib/groupInvites";

// GET /api/chat/group-invites -> { items: [{ id, name, by, groupName, description, visibility,
//                                  memberCount, photoVersion, createdAt }] }
// Group invites waiting for any username the signed-in account can chat as (`name`
// is the one invited, `id` the group). Accept or decline them with
// /api/chat/conversations (acceptInvite / declineInvite).
export async function GET(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });
    const db = getAdminDb();
    const [owned, linked] = await Promise.all([
      db.collection("usernames").where("uid", "==", caller.uid).get(),
      db.collection("usernames").where("linkedUids", "array-contains", caller.uid).get(),
    ]);
    const names = [...new Set([...owned.docs, ...linked.docs].filter((d) => !d.data().deleted).map((d) => d.id))];
    return NextResponse.json({ items: await groupInvitesFor(db, names) });
  } catch (e) {
    console.error("Group invites error:", e);
    return NextResponse.json({ error: e?.message || "Something went wrong." }, { status: 500 });
  }
}
