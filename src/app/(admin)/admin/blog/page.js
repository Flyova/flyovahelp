"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db, storage } from "@/lib/firebase";
import {
  collection, query, orderBy, onSnapshot,
  deleteDoc, doc, updateDoc, serverTimestamp
} from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import {
  Plus, Edit2, Trash2, Eye, EyeOff, Loader2,
  FileText, Globe, Clock, Calendar
} from "lucide-react";

export default function AdminBlogList() {
  const router = useRouter();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [toggling, setToggling] = useState(null);

  useEffect(() => {
    const q = query(collection(db, "blog_posts"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleDelete = async (post) => {
    if (!confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    setDeleting(post.id);
    try {
      if (post.coverImagePath) {
        await deleteObject(ref(storage, post.coverImagePath)).catch(() => {});
      }
      await deleteDoc(doc(db, "blog_posts", post.id));
    } finally {
      setDeleting(null);
    }
  };

  const handleTogglePublish = async (post) => {
    setToggling(post.id);
    await updateDoc(doc(db, "blog_posts", post.id), {
      published: !post.published,
      publishedAt: !post.published ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    });
    setToggling(null);
  };

  const formatDate = (ts) => {
    if (!ts) return "—";
    return ts.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black italic uppercase tracking-tighter text-white">
            Blog <span className="text-[#613de6]">Posts</span>
          </h1>
          <p className="text-xs text-slate-400 font-bold mt-0.5 uppercase tracking-wider">
            {posts.length} total · {posts.filter((p) => p.published).length} published
          </p>
        </div>
        <button
          onClick={() => router.push("/admin/blog/new")}
          className="flex items-center gap-2 bg-[#613de6] hover:brightness-110 text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-[#613de6]/20 transition-all active:scale-95"
        >
          <Plus size={16} /> New Post
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-60">
          <Loader2 size={28} className="animate-spin text-[#613de6]" />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-60 bg-[#0f172a] rounded-2xl border border-slate-800 gap-4">
          <FileText size={36} className="text-slate-600" />
          <p className="text-slate-500 font-black text-sm uppercase tracking-widest">No posts yet</p>
          <button
            onClick={() => router.push("/admin/blog/new")}
            className="flex items-center gap-2 bg-[#613de6] text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest"
          >
            <Plus size={14} /> Write First Post
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div
              key={post.id}
              className="bg-[#0f172a] rounded-2xl border border-slate-800 p-5 flex items-start gap-4 hover:border-slate-700 transition-colors"
            >
              {/* Cover thumbnail */}
              {post.coverImage ? (
                <img
                  src={post.coverImage}
                  alt={post.title}
                  className="w-20 h-16 rounded-xl object-cover shrink-0 bg-slate-900"
                />
              ) : (
                <div className="w-20 h-16 rounded-xl bg-slate-900 flex items-center justify-center shrink-0">
                  <FileText size={20} className="text-slate-600" />
                </div>
              )}

              {/* Meta */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black text-white truncate text-sm">{post.title || "Untitled"}</p>
                    <p className="text-xs text-slate-400 font-bold truncate mt-0.5">{post.excerpt || "No excerpt"}</p>
                  </div>
                  <span
                    className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${
                      post.published
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-slate-700/40 text-slate-300"
                    }`}
                  >
                    {post.published ? "Published" : "Draft"}
                  </span>
                </div>

                <div className="flex items-center gap-4 mt-2">
                  <span className="flex items-center gap-1 text-[10px] text-slate-400 font-bold">
                    <Calendar size={11} /> {formatDate(post.createdAt)}
                  </span>
                  {post.readTime && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-400 font-bold">
                      <Clock size={11} /> {post.readTime} min read
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => router.push(`/admin/blog/${post.id}`)}
                  className="p-2 rounded-xl text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
                  title="Edit"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleTogglePublish(post)}
                  disabled={toggling === post.id}
                  className={`p-2 rounded-xl transition-colors ${
                    post.published
                      ? "text-emerald-400 hover:bg-emerald-500/10"
                      : "text-slate-400 hover:bg-white/5"
                  }`}
                  title={post.published ? "Unpublish" : "Publish"}
                >
                  {toggling === post.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : post.published ? (
                    <Globe size={16} />
                  ) : (
                    <EyeOff size={16} />
                  )}
                </button>
                <button
                  onClick={() => handleDelete(post)}
                  disabled={deleting === post.id}
                  className="p-2 rounded-xl text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  {deleting === post.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
