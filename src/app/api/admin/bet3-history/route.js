import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { resolvePrivilegedRole } from "@/lib/adminAccess";

export const runtime = "nodejs";

const ADMIN_ROLES = new Set(["admin", "staff"]);

const parseBearerToken = (headerValue) => {
  const raw = String(headerValue || "").trim();
  if (!raw.toLowerCase().startsWith("bearer ")) return "";
  return raw.slice(7).trim();
};

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const serializeTime = (value) => {
  const ts = toMillis(value);
  return ts ? new Date(ts).toISOString() : null;
};

const getAuthorizedRequester = async (request) => {
  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) return { error: "Missing authorization token.", status: 401 };

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch {
    return { error: "Invalid or expired authorization token.", status: 401 };
  }

  const adminDb = getAdminDb();
  const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
  const userData = userSnap.exists ? userSnap.data() : {};
  const role = resolvePrivilegedRole(userData?.role, decoded.email);

  if (!role || !ADMIN_ROLES.has(role)) {
    return { error: "Administrative access required.", status: 403 };
  }

  return { adminDb };
};

const hydrateLiveGame = async (adminDb, docSnap) => {
  const row = docSnap.data() || {};
  const [p1Snap, p2Snap] = await Promise.all([
    row.player1 ? adminDb.collection("users").doc(row.player1).get() : null,
    row.player2 ? adminDb.collection("users").doc(row.player2).get() : null,
  ]);
  const p1 = p1Snap?.exists ? p1Snap.data() : {};
  const p2 = p2Snap?.exists ? p2Snap.data() : {};
  const totalRounds = Number(row?.round || 0);
  const p1RoundsPlayed = Number(row?.roundsPlayed?.p1 ?? Math.ceil(totalRounds / 2));
  const p2RoundsPlayed = Number(row?.roundsPlayed?.p2 ?? Math.floor(totalRounds / 2));

  return {
    id: docSnap.id,
    gameId: docSnap.id,
    amount: Number(row?.stakePerRound || 0),
    player1Id: row?.player1 || "",
    player1Name: p1?.fullName || p1?.username || "Player 1",
    player1Email: p1?.email || "",
    player2Id: row?.player2 || "",
    player2Name: p2?.fullName || p2?.username || "Player 2",
    player2Email: p2?.email || "",
    p1RoundsPlayed,
    p2RoundsPlayed,
    totalRounds,
    createdAt: serializeTime(row?.createdAt),
    finishedAt: serializeTime(row?.completedAt || row?.updatedAt),
  };
};

const serializeCompletedGame = (docSnap) => {
  const row = docSnap.data() || {};
  return {
    id: docSnap.id,
    gameId: row.gameId || docSnap.id,
    amount: Number(row.amount || 0),
    player1Id: row.player1Id || "",
    player1Name: row.player1Name || "Player 1",
    player1Email: row.player1Email || "",
    player2Id: row.player2Id || "",
    player2Name: row.player2Name || "Player 2",
    player2Email: row.player2Email || "",
    p1RoundsPlayed: Number(row.p1RoundsPlayed || 0),
    p2RoundsPlayed: Number(row.p2RoundsPlayed || 0),
    totalRounds: Number(row.totalRounds || 0),
    createdAt: serializeTime(row.createdAt),
    finishedAt: serializeTime(row.finishedAt || row.completedAt || row.updatedAt || row.createdAt),
  };
};

export async function GET(request) {
  try {
    const requester = await getAuthorizedRequester(request);
    if (requester.error) {
      return NextResponse.json({ error: requester.error }, { status: requester.status });
    }

    const [completedSnap, liveSnap] = await Promise.all([
      requester.adminDb.collection("completed_games").get(),
      requester.adminDb.collection("games").where("status", "==", "completed").get(),
    ]);

    const byId = new Map();
    for (const docSnap of completedSnap.docs) {
      const row = serializeCompletedGame(docSnap);
      byId.set(row.gameId || row.id, row);
    }

    const liveRows = await Promise.all(liveSnap.docs.map((docSnap) => hydrateLiveGame(requester.adminDb, docSnap)));
    for (const row of liveRows) {
      const key = row.gameId || row.id;
      byId.set(key, { ...(byId.get(key) || {}), ...row });
    }

    const matches = Array.from(byId.values()).sort(
      (a, b) => toMillis(b.finishedAt || b.createdAt) - toMillis(a.finishedAt || a.createdAt)
    );

    return NextResponse.json({ matches });
  } catch (error) {
    console.error("Bet3 history fetch error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not load Bet 3 history." },
      { status: 500 }
    );
  }
}
