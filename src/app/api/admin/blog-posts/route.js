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

const getAuthorizedRequester = async (request) => {
  const token = parseBearerToken(request.headers.get("authorization"));
  if (!token) return { error: "Missing authorization token.", status: 401 };

  const adminDb = getAdminDb();
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch (error) {
    console.error("Blog admin token verification failed:", error);
    return { error: "Invalid or expired authorization token.", status: 401 };
  }

  const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
  const userData = userSnap.exists ? userSnap.data() : {};
  const role = resolvePrivilegedRole(userData?.role, decoded.email);

  if (!role || !ADMIN_ROLES.has(role)) {
    return { error: "Administrative access required.", status: 403 };
  }

  return { adminDb, role, uid: decoded.uid };
};

const normalizeTime = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  return null;
};

const normalizeString = (value) => String(value || "").trim();

const normalizeKeywords = (values) => (
  Array.isArray(values)
    ? [...new Set(values.map((value) => normalizeString(value)).filter(Boolean))]
    : []
);

const serializePost = (docSnap) => {
  const data = docSnap.data() || {};
  return {
    id: docSnap.id,
    title: data.title || "",
    slug: data.slug || "",
    excerpt: data.excerpt || "",
    content: data.content || "",
    author: data.author || "Flyovahelp Team",
    coverImage: data.coverImage || "",
    coverImagePath: data.coverImagePath || "",
    keywords: normalizeKeywords(data.keywords),
    metaTitle: data.metaTitle || "",
    metaDescription: data.metaDescription || "",
    published: data.published === true,
    readTime: Number(data.readTime || 0),
    createdAt: normalizeTime(data.createdAt),
    updatedAt: normalizeTime(data.updatedAt),
    publishedAt: normalizeTime(data.publishedAt),
  };
};

const normalizePostPayload = (payload) => {
  const data = payload?.data || {};
  return {
    title: normalizeString(data.title),
    slug: normalizeString(data.slug),
    excerpt: normalizeString(data.excerpt),
    content: String(data.content || ""),
    author: normalizeString(data.author) || "Flyovahelp Team",
    coverImage: normalizeString(data.coverImage),
    coverImagePath: normalizeString(data.coverImagePath),
    keywords: normalizeKeywords(data.keywords),
    metaTitle: normalizeString(data.metaTitle),
    metaDescription: normalizeString(data.metaDescription),
    published: data.published === true,
    readTime: Math.max(1, Number(data.readTime || 1)),
  };
};

export async function GET(request) {
  try {
    const requester = await getAuthorizedRequester(request);
    if (requester.error) {
      return NextResponse.json({ error: requester.error }, { status: requester.status });
    }

    const id = String(request.nextUrl.searchParams.get("id") || "").trim();
    if (id) {
      const postSnap = await requester.adminDb.collection("blog_posts").doc(id).get();
      if (!postSnap.exists) {
        return NextResponse.json({ error: "Post not found." }, { status: 404 });
      }
      return NextResponse.json({ post: serializePost(postSnap) });
    }

    const postsSnap = await requester.adminDb
      .collection("blog_posts")
      .orderBy("createdAt", "desc")
      .get();

    return NextResponse.json({ posts: postsSnap.docs.map(serializePost) });
  } catch (error) {
    console.error("Blog posts fetch error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not load blog posts." },
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
    const id = normalizeString(payload.id);
    if (!id) return NextResponse.json({ error: "Post ID is required." }, { status: 400 });

    const data = normalizePostPayload(payload);
    if (!data.title) return NextResponse.json({ error: "Post title is required." }, { status: 400 });

    const postRef = requester.adminDb.collection("blog_posts").doc(id);
    const existingSnap = await postRef.get();
    const existing = existingSnap.exists ? existingSnap.data() || {} : {};
    const publishedAt = data.published
      ? existing.publishedAt || admin.firestore.FieldValue.serverTimestamp()
      : null;

    await postRef.set(
      {
        ...data,
        publishedAt,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(existingSnap.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
      },
      { merge: true }
    );

    const savedSnap = await postRef.get();
    return NextResponse.json({ post: serializePost(savedSnap) });
  } catch (error) {
    console.error("Blog post save error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not save blog post." },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const requester = await getAuthorizedRequester(request);
    if (requester.error) {
      return NextResponse.json({ error: requester.error }, { status: requester.status });
    }

    const payload = await request.json().catch(() => ({}));
    const id = normalizeString(payload.id);
    if (!id) return NextResponse.json({ error: "Post ID is required." }, { status: 400 });

    const updates = {};
    if (Object.prototype.hasOwnProperty.call(payload, "published")) {
      updates.published = payload.published === true;
      updates.publishedAt = updates.published ? admin.firestore.FieldValue.serverTimestamp() : null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No supported update fields provided." }, { status: 400 });
    }

    const postRef = requester.adminDb.collection("blog_posts").doc(id);
    await postRef.update({
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const postSnap = await postRef.get();
    return NextResponse.json({ post: serializePost(postSnap) });
  } catch (error) {
    console.error("Blog post update error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not update blog post." },
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
    if (!id) return NextResponse.json({ error: "Post ID is required." }, { status: 400 });

    await requester.adminDb.collection("blog_posts").doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Blog post delete error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not delete blog post." },
      { status: 500 }
    );
  }
}
