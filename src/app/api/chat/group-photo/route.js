import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { isGroupAdmin, ownedUsername } from "@/lib/chat";

// Group photos. The image (a small square JPEG data URL) lives in
// group_photos/{groupId}, which only this route reads and writes; the group itself
// carries `photoVersion` (when it last changed, 0 = none) so apps know to show it.
//
//   GET  ?id=<groupId>[&v=<photoVersion>]   -> the JPEG (404 when the group has none)
//   POST { convoId, as, photoURL }           -> { ok, photoVersion }  admins; photoURL "" removes it

const MAX_CHARS = 100000;
const PREFIX = "data:image/jpeg;base64,";
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const fail = (error, status = 400) => NextResponse.json({ error }, { status });
const FV = () => admin.firestore.FieldValue;

export async function GET(req) {
  const params = new URL(req.url).searchParams;
  const id = String(params.get("id") || "");
  if (!ID_RE.test(id)) return new Response("Not found", { status: 404 });
  const snap = await getAdminDb().collection("group_photos").doc(id).get();
  const url = snap.exists ? String(snap.data().photoURL || "") : "";
  if (!url.startsWith(PREFIX)) return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
  const bytes = Uint8Array.from(atob(url.slice(PREFIX.length)), (c) => c.charCodeAt(0));
  // A versioned URL never changes (a new photo gets a new version); an unversioned one is rechecked soon.
  const cache = params.get("v") ? "public, max-age=31536000, immutable" : "public, max-age=300";
  return new Response(bytes, { headers: { "Content-Type": "image/jpeg", "Cache-Control": cache } });
}

export async function POST(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return fail("Sign in again to continue.", 401);
    const { convoId, as, photoURL } = await req.json().catch(() => ({}));
    const photo = String(photoURL || "");
    if (photo && (!photo.startsWith(PREFIX) || photo.length > MAX_CHARS)) return fail("That photo is too big or not a JPEG.");
    const db = getAdminDb();
    const me = await ownedUsername(db, caller.uid, as);
    if (!me) return fail("You can only act as one of your own usernames.", 403);
    if (!ID_RE.test(String(convoId || ""))) return fail("Group not found.", 404);
    const ref = db.collection("conversations").doc(String(convoId));
    const snap = await ref.get();
    const convo = snap.exists ? snap.data() : null;
    if (!convo || convo.deleted || convo.type !== "group") return fail("Group not found.", 404);
    if (!isGroupAdmin(convo, me.lower)) return fail("Only group admins can change the group photo.", 403);

    const photoVersion = photo ? Date.now() : 0;
    const text = photo ? `@${me.lower} changed the group photo` : `@${me.lower} removed the group photo`;
    const batch = db.batch();
    batch.set(db.collection("group_photos").doc(String(convoId)), { photoURL: photo, by: me.lower, updatedAt: FV().serverTimestamp() });
    batch.set(ref.collection("messages").doc(), { kind: "system", sender: "", text, createdAt: FV().serverTimestamp(), deletedForEveryone: false });
    batch.update(ref, { photoVersion, lastMessage: text, lastMessageAt: FV().serverTimestamp() });
    await batch.commit();
    return NextResponse.json({ ok: true, photoVersion });
  } catch (e) {
    console.error("Group photo error:", e);
    return fail(e?.message || "Something went wrong.", 500);
  }
}
