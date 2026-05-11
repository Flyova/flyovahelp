"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { Calendar, Clock, ArrowLeft, ArrowRight, Loader2, FileText } from "lucide-react";

export default function BlogPostPage() {
  const params = useParams();
  const router = useRouter();
  const [post, setPost] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPost = async () => {
      const q = query(
        collection(db, "blog_posts"),
        where("slug", "==", params.slug),
        where("published", "==", true)
      );
      const snap = await getDocs(q);
      if (snap.empty) { router.push("/blog"); return; }
      const data = { id: snap.docs[0].id, ...snap.docs[0].data() };
      setPost(data);

      // Fetch related (latest 3 excluding current)
      const rSnap = await getDocs(
        query(collection(db, "blog_posts"), where("published", "==", true), orderBy("publishedAt", "desc"), limit(4))
      );
      setRelated(
        rSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p) => p.id !== data.id)
          .slice(0, 3)
      );
      setLoading(false);
    };
    fetchPost();
  }, [params.slug, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-[#613de6]" />
      </div>
    );
  }

  if (!post) return null;

  const date = post.publishedAt?.toDate().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none select-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-150 h-75 bg-[#613de6] rounded-full opacity-[0.08] blur-[100px]" />
      </div>

      {/* Nav */}
      <div className="relative z-10 sticky top-0 bg-[#0f172a]/90 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <Link href="/">
          <Image src="/logo.svg" alt="Flyovahelp" width={110} height={28} />
        </Link>
        <Link href="/blog" className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={14} /> All Posts
        </Link>
      </div>

      <article className="relative z-10 max-w-3xl mx-auto px-6 py-12">
        {/* Meta */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <Link href="/blog" className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#a78bfa] hover:text-white transition-colors">
            <ArrowLeft size={12} /> Blog
          </Link>
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
            <Calendar size={11} /> {date}
          </span>
          {post.readTime && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
              <Clock size={11} /> {post.readTime} min read
            </span>
          )}
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
            By {post.author}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter leading-none mb-6">
          {post.title}
        </h1>

        {/* Excerpt */}
        {post.excerpt && (
          <p className="text-base text-gray-400 font-bold leading-relaxed mb-8 border-l-2 border-[#613de6] pl-4">
            {post.excerpt}
          </p>
        )}

        {/* Cover image */}
        {post.coverImage && (
          <div className="w-full mb-10 rounded-2xl overflow-hidden">
            <img
              src={post.coverImage}
              alt={post.title}
              className="w-full h-auto max-h-[480px] object-cover"
            />
          </div>
        )}

        {/* Content */}
        <div
          className="tiptap-prose"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {/* Divider */}
        <div className="mt-14 mb-10 h-px bg-white/8" />

        {/* Author card */}
        <div className="flex items-center gap-4 bg-[#1e293b] border border-white/5 rounded-2xl p-5">
          <div className="w-12 h-12 rounded-2xl bg-[#613de6]/30 flex items-center justify-center shrink-0">
            <span className="text-lg font-black text-[#a78bfa]">{post.author?.[0] ?? "F"}</span>
          </div>
          <div>
            <p className="font-black text-white text-sm">{post.author}</p>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Flyovahelp Team</p>
          </div>
        </div>
      </article>

      {/* Related posts */}
      {related.length > 0 && (
        <section className="relative z-10 max-w-5xl mx-auto px-6 pb-16">
          <div className="border-t border-white/5 pt-12">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 mb-2">Keep Reading</p>
            <h2 className="text-2xl font-black italic uppercase tracking-tighter mb-7">
              More Posts
            </h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-5">
              {related.map((p) => {
                const d = p.publishedAt?.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                return (
                  <Link
                    key={p.id}
                    href={`/blog/${p.slug}`}
                    className="group bg-[#1e293b] border border-white/5 hover:border-white/15 rounded-2xl overflow-hidden transition-all"
                  >
                    {p.coverImage ? (
                      <img src={p.coverImage} alt={p.title} className="w-full h-36 object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="h-36 bg-gradient-to-br from-[#613de6]/20 to-[#fc7952]/10 flex items-center justify-center">
                        <FileText size={24} className="text-white/20" />
                      </div>
                    )}
                    <div className="p-4">
                      <p className="font-black text-white text-sm leading-snug line-clamp-2 group-hover:text-[#a78bfa] transition-colors">{p.title}</p>
                      <div className="flex items-center gap-1.5 mt-2 text-[10px] font-black text-[#fc7952] uppercase tracking-wider">
                        Read <ArrowRight size={11} />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
