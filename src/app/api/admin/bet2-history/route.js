import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { resolvePrivilegedRole } from "@/lib/adminAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

const parsePlanName = (title = "") => {
  if (!title.startsWith("Predict Stake:")) return "";
  return title.replace("Predict Stake:", "").trim() || "Unknown Plan";
};

const getAuthorizedRequester = async (request) => {
  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) return { error: "Missing authorization token.", status: 401 };

  const adminDb = getAdminDb();
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch (error) {
    console.error("Bet2 history token verification failed:", error);
    return { error: "Invalid or expired authorization token.", status: 401 };
  }

  const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
  const userData = userSnap.exists ? userSnap.data() : {};
  const role = resolvePrivilegedRole(userData?.role, decoded.email);

  if (!role || !ADMIN_ROLES.has(role)) {
    return { error: "Administrative access required.", status: 403 };
  }

  return { adminDb };
};

const profileFromUser = (uid, data = {}) => ({
  userId: uid,
  name: data.fullName || data.username || "User",
  email: data.email || "",
  pin: data.pin || "--------",
  country: data.country || "",
});

export async function GET(request) {
  try {
    const requester = await getAuthorizedRequester(request);
    if (requester.error) {
      return NextResponse.json({ error: requester.error }, { status: requester.status });
    }

    const usersSnap = await requester.adminDb.collection("users").get();
    const sessions = [];

    await Promise.all(
      usersSnap.docs.map(async (userDoc) => {
        const profile = profileFromUser(userDoc.id, userDoc.data());
        const txSnap = await userDoc.ref.collection("transactions").get();
        const events = [];

        txSnap.docs.forEach((txDoc) => {
          const tx = txDoc.data() || {};
          const timestamp = tx.timestamp || tx.createdAt || tx.updatedAt;
          const tsMs = toMillis(timestamp);
          if (tsMs <= 0) return;

          const title = tx.title || "";
          const planName = parsePlanName(title);
          const isPlanStake = Boolean(planName);
          const isPredictRound = title === "Predict and Win" || title === "Predict Win" || tx.type === "prediction";
          const isPredictWin = title === "Predict Win";

          if (!isPlanStake && !isPredictRound && !isPredictWin) return;

          events.push({
            type: isPlanStake ? "stake" : isPredictWin ? "win" : "round",
            planName,
            amount: Number(tx.amount || 0),
            timestamp,
            tsMs,
          });
        });

        const sorted = events.sort((a, b) => a.tsMs - b.tsMs);
        let currentSession = null;

        sorted.forEach((event) => {
          if (event.type === "stake") {
            currentSession = {
              id: `${profile.userId}_${event.tsMs}`,
              userId: profile.userId,
              player: profile,
              plan: event.planName,
              roundsPlayed: 0,
              amountEarned: 0,
              time: serializeTime(event.timestamp),
              tsMs: event.tsMs,
            };
            sessions.push(currentSession);
            return;
          }

          if (!currentSession) return;

          if (event.type === "round" || event.type === "win") {
            currentSession.roundsPlayed += 1;
          }
          if (event.type === "win") {
            currentSession.amountEarned += Number(event.amount || 0);
          }
        });
      })
    );

    sessions.sort((a, b) => b.tsMs - a.tsMs);
    return NextResponse.json({
      rows: sessions.map(({ tsMs, ...row }) => row),
    });
  } catch (error) {
    console.error("Bet2 history fetch error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not load Bet 2 history." },
      { status: 500 }
    );
  }
}
