import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { inGroupAs, norm } from "@/lib/chat";
import { getCaller } from "@/lib/apiAuth";
import { resolvePrivilegedRole } from "@/lib/adminAccess";
import { chatSettingsFor } from "@/lib/chatSettings";
import { accountCreatedMs } from "@/lib/money";

const MAX_GROUPS = 10;

// GET /api/chat/profile?u=username&as=yours — the public profile shown when you tap a
// player in chat: chat username, bio, status and gender, country (unless they hide it),
// when they joined StraWins, badges (verified, agent, StraWins staff), the public
// groups they're in, and their chat coins only if they chose to show them off.
// Never their real name, email, phone, PIN or money balances.
export async function GET(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });
    const params = new URL(req.url).searchParams;
    const lower = norm(params.get("u")).replace(/^@/, "");
    const as = params.get("as") || ""; // the username you're viewing as: which of their groups it's in
    if (!lower) return NextResponse.json({ error: "Username required." }, { status: 400 });

    const db = getAdminDb();
    const nameSnap = await db.collection("usernames").doc(lower).get();
    const n = nameSnap.exists ? nameSnap.data() : null;
    if (!n || n.deleted || !n.uid) return NextResponse.json({ error: "This player no longer exists." }, { status: 404 });

    const [[profileSnap, userSnap, coinSnap], settings] = await Promise.all([
      db.getAll(
        db.collection("chat_profiles").doc(lower),
        db.collection("users").doc(n.uid),
        db.collection("username_wallets").doc(lower),
      ),
      chatSettingsFor(db, [{ name: lower, uid: n.uid }]),
    ]);
    const p = profileSnap.exists ? profileSnap.data() : {};
    const u = userSnap.exists ? userSnap.data() : {};
    // This chat profile's own settings (Chat settings → Privacy).
    const { hideCountry, showCoins, groupAdds } = settings.get(lower);
    const memberSince = (await accountCreatedMs(n.uid, u)) ?? n.createdAt?.toMillis?.() ?? null;

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
        isMember: inGroupAs(g, caller.uid, as),
      }));
    return NextResponse.json({
      username: n.username || lower,
      usernameLower: lower,
      bio: p.bio || "",
      status: p.status || "",
      gender: ["male", "female"].includes(p.gender) ? p.gender : "", // "" when they'd rather not say
      country: hideCountry ? "" : u.country || "",
      memberSince, // ms
      badges: [
        u.verified === true && "verified",
        u.isAgent === true && "agent",
        resolvePrivilegedRole(u.role, u.email) && "staff",
      ].filter(Boolean),
      publicGroups,
      isYou: n.uid === caller.uid || (n.linkedUids || []).includes(caller.uid),
      groupAdds, // who can add them to groups: "everyone", "ask" (they get an invite) or "nobody"
      allowsGroupAdds: groupAdds !== "nobody",
      coins: showCoins ? Math.max(0, Number(coinSnap.exists ? coinSnap.data().balance : 0) || 0) : null,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
