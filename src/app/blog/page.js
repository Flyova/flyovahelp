"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { Calendar, Clock, ArrowRight, Search, Loader2, FileText, ChevronDown } from "lucide-react";

const PAGE_SIZE = 9;

function PostCard({ post }) {
  const date = post.publishedAt?.toDate().toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  }) ?? "";

  return (
    <Link href={`/blog/${post.slug}`} className="group flex flex-col bg-[#1e293b] border border-white/5 rounded-2xl overflow-hidden hover:border-white/15 hover:shadow-xl hover:shadow-black/30 transition-all duration-300">
      {post.coverImage ? (
        <div className="relative h-48 overflow-hidden bg-[#0f172a]">
          <img
            src={post.coverImage}
            alt={post.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        </div>
      ) : (
        <div className="h-48 bg-gradient-to-br from-[#613de6]/30 to-[#fc7952]/20 flex items-center justify-center">
          <FileText size={32} className="text-white/20" />
        </div>
      )}
      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-center gap-3 mb-3">
          <span className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
            <Calendar size={11} /> {date}
          </span>
          {post.readTime && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500">
              <Clock size={11} /> {post.readTime} min
            </span>
          )}
        </div>
        <h3 className="font-black text-white text-base leading-snug mb-2 group-hover:text-[#a78bfa] transition-colors line-clamp-2">
          {post.title}
        </h3>
        {post.excerpt && (
          <p className="text-xs text-gray-400 font-bold leading-relaxed line-clamp-3 flex-1">
            {post.excerpt}
          </p>
        )}
        <div className="flex items-center gap-1.5 mt-4 text-xs font-black text-[#fc7952] uppercase tracking-wider">
          Read More <ArrowRight size={13} className="group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </Link>
  );
}

export default function BlogPage() {
  const router = useRouter();
  const [allPosts, setAllPosts] = useState([]);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getDocs(query(collection(db, "blog_posts"), where("published", "==", true)))
      .then((snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const aTime = a.publishedAt?.toMillis?.() ?? 0;
            const bTime = b.publishedAt?.toMillis?.() ?? 0;
            return bTime - aTime;
          });
        setAllPosts(docs);
        setLoading(false);
      });
  }, []);

  const loadMore = () => setVisible((v) => v + PAGE_SIZE);

  const filtered = search.trim()
    ? allPosts.filter(
        (p) =>
          p.title?.toLowerCase().includes(search.toLowerCase()) ||
          p.excerpt?.toLowerCase().includes(search.toLowerCase())
      )
    : allPosts.slice(0, visible);

  const hasMore = !search.trim() && visible < allPosts.length;

  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none select-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-150 h-150 bg-[#613de6] rounded-full opacity-[0.08] blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 w-100 h-100 bg-[#fc7952] rounded-full opacity-[0.06] blur-[100px]" />
      </div>

      {/* Nav */}
      <div className="relative z-10 sticky top-0 bg-[#0f172a]/90 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <Link href="/">
          <Image src="/logo.svg" alt="Flyovahelp" width={110} height={28} />
        </Link>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/login")} className="text-xs font-black uppercase tracking-wider text-gray-400 hover:text-white transition-colors">
            Login
          </button>
          <button
            onClick={() => router.push("/register")}
            className="bg-[#613de6] hover:brightness-110 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
          >
            Sign Up
          </button>
        </div>
      </div>

      {/* Hero */}
      <section className="relative z-10 px-6 pt-16 pb-12 text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-[#613de6]/15 border border-[#613de6]/30 text-[#a78bfa] text-[10px] font-black uppercase tracking-[0.25em] px-4 py-2 rounded-full mb-6">
          Latest from Flyovahelp
        </div>
        <h1 className="text-5xl md:text-6xl font-black italic uppercase tracking-tighter leading-none mb-4">
          The <span className="text-[#613de6]">Blog</span>
        </h1>
        <p className="text-gray-400 font-bold max-w-lg mx-auto text-sm leading-relaxed">
          Tips, updates, strategies and news from the Flyovahelp Arena.
        </p>
      </section>

      {/* Search */}
      <div className="relative z-10 max-w-2xl mx-auto px-6 mb-10">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Search posts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#1e293b] border border-white/5 focus:border-[#613de6]/40 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-bold text-white placeholder:text-gray-600 outline-none transition-colors"
          />
        </div>
      </div>

      {/* Posts */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-20">
        {loading ? (
          <div className="flex items-center justify-center h-60">
            <Loader2 size={28} className="animate-spin text-[#613de6]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 gap-4">
            <FileText size={36} className="text-gray-600" />
            <p className="text-gray-500 font-black text-sm uppercase tracking-widest">
              {search ? "No posts match your search" : "No posts yet"}
            </p>
          </div>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center mt-10">
                <button
                  onClick={loadMore}
                  className="flex items-center gap-2 bg-[#1e293b] border border-white/5 hover:border-white/15 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all"
                >
                  <ChevronDown size={14} /> Load More
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
