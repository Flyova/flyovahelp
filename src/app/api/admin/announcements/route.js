import { NextResponse } from "next/server";
import { admin, getAdminDb } from "@/lib/firebaseAdmin";
import { resolvePrivilegedRole } from "@/lib/adminAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_ROLES = new Set(["admin", "staff"]);
const VALID_TYPES = new Set(["info", "warning", "success"]);

const parseBearerToken = (headerValue) => {
  const raw = String(headerValue || "").trim();
  if (!raw.toLowerCase().startsWith("bearer ")) return "";
  return raw.slice(7).trim();
};

const getAuthorizedRequester = async (request) => {
  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) return { error: "Missing authorization token.", status: 401 };

  const adminDb = getAdminDb();
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch (error) {
    console.error("Announcement admin token verification failed:", error);
    return { error: "Invalid or expired authorization token.", status: 401 };
  }

  const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
  const userData = userSnap.exists ? userSnap.data() : {};
  const role = resolvePrivilegedRole(userData?.role, decoded.email);

  if (!role || !ADMIN_ROLES.has(role)) {
    return { error: "Administrative access required.", status: 403 };
  }

  return {
    adminDb,
    uid: decoded.uid,
    email: decoded.email || "",
    role,
  };
};

const normalizeTime = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  return null;
};

const serializeAnnouncement = (docSnap) => {
  const data = docSnap.data() || {};
  return {
    id: data.id || docSnap.id,
    message: String(data.message || ""),
    type: VALID_TYPES.has(data.type) ? data.type : "info",
    active: data.active !== false,
    timestamp: normalizeTime(data.timestamp),
    createdBy: data.createdBy || "",
    createdByEmail: data.createdByEmail || "",
  };
};

export async function GET(request) {
  try {
    const requester = await getAuthorizedRequester(request);
    if (requester.error) {
      return NextResponse.json({ error: requester.error }, { status: requester.status });
    }

    const snap = await requester.adminDb
      .collection("broadcasts")
      .orderBy("timestamp", "desc")
      .limit(50)
      .get();

    return NextResponse.json({ announcements: snap.docs.map(serializeAnnouncement) });
  } catch (error) {
    console.error("Announcements fetch error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not load announcements." },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const requester = await getAuthorizedRequester(request);
    if (requester.error) {
      return NextResponse.json({ error: requester.error }, { status: requester.status });
    }

    const payload = await request.json().catch(() => ({}));
    const message = String(payload.message || "").trim();
    const type = VALID_TYPES.has(payload.type) ? payload.type : "info";

    if (!message) {
      return NextResponse.json({ error: "Announcement message is required." }, { status: 400 });
    }

    const announcementRef = requester.adminDb.collection("broadcasts").doc();
    await announcementRef.set({
      id: announcementRef.id,
      message,
      type,
      active: true,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: requester.uid,
      createdByEmail: requester.email,
    });

    const savedSnap = await announcementRef.get();
    return NextResponse.json({ announcement: serializeAnnouncement(savedSnap) });
  } catch (error) {
    console.error("Announcement create error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not send announcement." },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const requester = await getAuthorizedRequester(request);
    if (requester.error) {
      return NextResponse.json({ error: requester.error }, { status: requester.status });
    }

    const id = String(request.nextUrl.searchParams.get("id") || "").trim();
    if (!id) return NextResponse.json({ error: "Announcement ID is required." }, { status: 400 });

    await requester.adminDb.collection("broadcasts").doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Announcement delete error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not delete announcement." },
      { status: 500 }
    );
  }
}
