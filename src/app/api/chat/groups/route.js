import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { groupByInvite, groupOwner, groupSearchTerm } from "@/lib/chat";

const LIMIT = 20;
const POPULAR_SCAN = 100;

const millis = (ts) => ts?.toMillis?.() ?? 0;

// GET /api/chat/groups?q=... — public groups anyone can find and join.
// GET /api/chat/groups?code=... — the group an invite link opens (name, description, members).
// With a search term: groups whose name has a word (or starts with the phrase)
// beginning with it. Without one: the biggest, then most recently active, groups.
// Single-field queries only, so no composite index is needed.
export async function GET(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });
    const params = new URL(req.url).searchParams;
    // ?code=<invite code>: what the group link opens, to show before joining.
    if (params.has("code")) {
      const g = await groupByInvite(getAdminDb(), params.get("code"));
      if (!g) return NextResponse.json({ error: "This group link doesn't work any more. Ask an admin for a new one." }, { status: 404 });
      const d = g.data();
      return NextResponse.json({
        group: {
          id: g.id,
          groupName: d.groupName || "Group",
          description: d.description || "",
          memberCount: (d.participants || []).length,
          visibility: d.visibility === "public" ? "public" : "private",
          isMember: (d.participantUids || []).includes(caller.uid),
          photoVersion: Number(d.photoVersion) || 0,
        },
      });
    }
    const term = groupSearchTerm(params.get("q"));
    const groups = getAdminDb().collection("conversations");

    const snap = term
      ? await groups.where("searchKeys", "array-contains", term).limit(LIMIT * 2).get()
      : await groups.where("visibility", "==", "public").limit(POPULAR_SCAN).get();

    const items = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((g) => g.type === "group" && g.visibility === "public" && !g.deleted)
      .sort((a, b) => (b.participants || []).length - (a.participants || []).length || millis(b.lastMessageAt) - millis(a.lastMessageAt))
      .slice(0, LIMIT)
      .map((g) => ({
        id: g.id,
        groupName: g.groupName || "Group",
        description: g.description || "",
        memberCount: (g.participants || []).length,
        owner: groupOwner(g),
        isMember: (g.participantUids || []).includes(caller.uid),
        photoVersion: Number(g.photoVersion) || 0,
      }));
    return NextResponse.json({ items });
  } catch (e) {
    console.error("Chat group search error:", e);
    return NextResponse.json({ error: e?.message || "Could not search groups." }, { status: 500 });
  }
}
