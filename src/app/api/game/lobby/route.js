import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";
import { isBanned, isGameRestricted } from "@/lib/money";

// Who's in the "play with friends" lobby right now. The apps used to read this
// straight from other players' accounts; players can only read their own now
// (Firestore rules), so this returns just what the lobby shows.
//
// The lobby is everyone on the game page, plus players who turned on "Always show
// me online" (users/{uid}.friendsStayOnline, Settings): they're listed wherever they
// are, with lastSeen = now so the apps' freshness filter keeps them, and a challenge
// reaches them as a notification.
//
//   GET -> { players: [{ id, username, isBusy, lastSeen, stayOnline }] }   lastSeen in ms

const LOBBY_PAGE = "challenge_friends";
const PRIVILEGED = ["admin", "staff", "support"];
const STAY_ONLINE_LIMIT = 300;

export async function GET(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });
    const users = getAdminDb().collection("users");
    const [here, stay] = await Promise.all([
      users.where("status", "==", "online").where("currentPage", "==", LOBBY_PAGE).get(),
      users.where("friendsStayOnline", "==", true).limit(STAY_ONLINE_LIMIT).get(),
    ]);
    const now = Date.now();
    const players = new Map();
    for (const d of here.docs) {
      players.set(d.id, {
        id: d.id,
        username: d.data().username || "Player",
        isBusy: !!d.data().isBusy,
        lastSeen: d.data().lastSeen?.toMillis?.() || 0,
        stayOnline: false,
      });
    }
    for (const d of stay.docs) {
      const u = d.data();
      if (isBanned(u) || isGameRestricted(u, "friends")) continue;
      const onPage = players.get(d.id);
      players.set(d.id, {
        id: d.id,
        username: u.username || "Player",
        isBusy: !!onPage?.isBusy,
        lastSeen: now,
        stayOnline: true,
      });
    }
    const list = [...players.values()].filter((p) => p.id !== caller.uid);
    const roles = new Map([...here.docs, ...stay.docs].map((d) => [d.id, d.data().role]));
    return NextResponse.json({ players: list.filter((p) => !PRIVILEGED.includes(roles.get(p.id))) });
  } catch (e) {
    console.error("Lobby error:", e);
    return NextResponse.json({ error: "Could not load players." }, { status: 500 });
  }
}
