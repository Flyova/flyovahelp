import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { groupOwner, groupSearchTerm } from "@/lib/chat";

const LIMIT = 20;
const POPULAR_SCAN = 100;

const millis = (ts) => ts?.toMillis?.() ?? 0;

// GET /api/chat/groups?q=... — public groups anyone can find and join.
// With a search term: groups whose name has a word (or starts with the phrase)
// beginning with it. Without one: the biggest, then most recently active, groups.
// Single-field queries only, so no composite index is needed.
export async function GET(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });
    const term = groupSearchTerm(new URL(req.url).searchParams.get("q"));
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
      }));
    return NextResponse.json({ items });
  } catch (e) {
    console.error("Chat group search error:", e);
    return NextResponse.json({ error: e?.message || "Could not search groups." }, { status: 500 });
  }
}
