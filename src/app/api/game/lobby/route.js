import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getCaller } from "@/lib/apiAuth";

// Who's in the "play with friends" lobby right now. The apps used to read this
// straight from other players' accounts; players can only read their own now
// (Firestore rules), so this returns just what the lobby shows.
//
//   GET -> { players: [{ id, username, isBusy, lastSeen }] }   lastSeen in ms

const LOBBY_PAGE = "challenge_friends";
const PRIVILEGED = ["admin", "staff", "support"];

export async function GET(req) {
  try {
    const caller = await getCaller(req);
    if (!caller) return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });
    const snap = await getAdminDb().collection("users")
      .where("status", "==", "online").where("currentPage", "==", LOBBY_PAGE).get();
    const players = snap.docs
      .filter((d) => d.id !== caller.uid && !PRIVILEGED.includes(d.data().role))
      .map((d) => ({
        id: d.id,
        username: d.data().username || "Player",
        isBusy: !!d.data().isBusy,
        lastSeen: d.data().lastSeen?.toMillis?.() || 0,
      }));
    return NextResponse.json({ players });
  } catch (e) {
    console.error("Lobby error:", e);
    return NextResponse.json({ error: "Could not load players." }, { status: 500 });
  }
}
