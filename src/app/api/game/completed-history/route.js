import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const parseBearerToken = (headerValue) => {
  const raw = String(headerValue || "").trim();
  if (!raw.toLowerCase().startsWith("bearer ")) return "";
  return raw.slice(7).trim();
};

export async function POST(request) {
  try {
    const token = parseBearerToken(request.headers.get("authorization"));
    if (!token) {
      return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
    }

    const adminDb = getAdminDb();
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch (error) {
      console.error("Completed game token verification failed:", error);
      return NextResponse.json({ error: "Invalid or expired authorization token." }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({}));
    const gameId = String(payload?.gameId || "").trim();
    if (!gameId) {
      return NextResponse.json({ error: "Game ID is required." }, { status: 400 });
    }

    const gameRef = adminDb.collection("games").doc(gameId);
    const gameSnap = await gameRef.get();
    if (!gameSnap.exists) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }

    const game = gameSnap.data() || {};
    const isParticipant = decoded.uid === game.player1 || decoded.uid === game.player2;
    if (!isParticipant) {
      return NextResponse.json({ error: "You are not part of this game." }, { status: 403 });
    }

    if (game.status !== "completed") {
      return NextResponse.json({ error: "Game is not completed yet." }, { status: 409 });
    }

    const [p1Snap, p2Snap] = await Promise.all([
      adminDb.collection("users").doc(game.player1).get(),
      adminDb.collection("users").doc(game.player2).get(),
    ]);
    const p1 = p1Snap.exists ? p1Snap.data() : {};
    const p2 = p2Snap.exists ? p2Snap.data() : {};
    const totalRounds = Number(game?.round || 0);
    const p1Score = Number(game?.scores?.p1 || 0);
    const p2Score = Number(game?.scores?.p2 || 0);

    const completedRef = adminDb.collection("completed_games").doc(gameId);
    const pairId = [game.player1, game.player2].sort().join("_");
    const headToHeadRef = adminDb.collection("head_to_head").doc(pairId);
    const winnerId = p1Score === p2Score ? null : (p1Score > p2Score ? game.player1 : game.player2);

    const archiveData = {
      gameId,
      amount: Number(game.stakePerRound || 0),
      player1Id: game.player1,
      player1Name: p1.fullName || p1.username || "Player 1",
      player1Email: p1.email || "",
      player1Pin: p1.pin || "",
      player1Country: p1.country || "",
      player2Id: game.player2,
      player2Name: p2.fullName || p2.username || "Player 2",
      player2Email: p2.email || "",
      player2Pin: p2.pin || "",
      player2Country: p2.country || "",
      p1RoundsPlayed: p1Score,
      p2RoundsPlayed: p2Score,
      p1Score,
      p2Score,
      totalRounds,
      createdAt: game?.createdAt || null,
      finishedAt: game?.completedAt || admin.firestore.FieldValue.serverTimestamp(),
    };

    // Gate the head-to-head tally increment on whether this game has already
    // been archived, so calling this endpoint twice for the same gameId
    // (e.g. once automatically, once when the player claims) never double-counts.
    await adminDb.runTransaction(async (tx) => {
      const existingSnap = await tx.get(completedRef);
      tx.set(completedRef, archiveData, { merge: true });

      if (!existingSnap.exists && winnerId) {
        tx.set(
          headToHeadRef,
          {
            players: [game.player1, game.player2].sort(),
            [`wins.${winnerId}`]: admin.firestore.FieldValue.increment(1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Completed game history save error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not save game history." },
      { status: 500 }
    );
  }
}
