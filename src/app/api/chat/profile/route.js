import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { norm } from "@/lib/chat";
import { getCaller } from "@/lib/apiAuth";
import { resolvePrivilegedRole } from "@/lib/adminAccess";
import { chatSettingsFor } from "@/lib/chatSettings";

const MAX_GROUPS = 10;

// GET /api/chat/profile?u=username — the public profile shown when you tap a
// player in chat: chat username, bio and status, country (unless they hide it),
// badges (verified, agent, StraWins staff), the public groups they're in, and
// their chat coins only if they chose to show them off. Never their real name,
// join date, email, phone, PIN or money balances.
export async function GET(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });
    const lower = norm(new URL(req.url).searchParams.get("u")).replace(/^@/, "");
    if (!lower) return NextResponse.json({ error: "Username required." }, { status: 400 });

    const db = getAdminDb();
    const nameSnap = await db.collection("usernames").doc(lower).get();
    const n = nameSnap.exists ? nameSnap.data() : null;
    if (!n || n.deleted || !n.uid) return NextResponse.json({ error: "This player no longer exists." }, { status: 404 });

    const [[profileSnap, userSnap, coinSnap], settings] = await Promise.all([
      db.getAll(
        db.collection("chat_profiles").doc(lower),
        db.collection("users").doc(n.uid),
        db.collection("coin_wallets").doc(n.uid),
      ),
      chatSettingsFor(db, [{ name: lower, uid: n.uid }]),
    ]);
    const p = profileSnap.exists ? profileSnap.data() : {};
    const u = userSnap.exists ? userSnap.data() : {};
    // This chat profile's own settings (Chat settings → Privacy).
    const { hideCountry, showCoins } = settings.get(lower);

    // Public groups they're in (never private groups or chats).
    const convoSnap = await db.collection("conversations").where("participants", "array-contains", lower).limit(100).get();
    const publicGroups = convoSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((g) => g.type === "group" && g.visibility === "public" && !g.deleted)
      .slice(0, MAX_GROUPS)
      .map((g) => ({
        id: g.id,
        groupName: g.groupName || "Group",
        memberCount: (g.participants || []).length,
        isMember: (g.participantUids || []).includes(caller.uid),
      }));
    return NextResponse.json({
      username: n.username || lower,
      usernameLower: lower,
      bio: p.bio || "",
      status: p.status || "",
      country: hideCountry ? "" : u.country || "",
      badges: [
        u.verified === true && "verified",
        u.isAgent === true && "agent",
        resolvePrivilegedRole(u.role, u.email) && "staff",
      ].filter(Boolean),
      publicGroups,
      isYou: n.uid === caller.uid || (n.linkedUids || []).includes(caller.uid),
      coins: showCoins ? Math.max(0, Number(coinSnap.exists ? coinSnap.data().balance : 0) || 0) : null,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
