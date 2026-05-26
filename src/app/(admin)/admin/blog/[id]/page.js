"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import {
  Save, Globe, EyeOff, ArrowLeft, Upload, X, Loader2, Image as ImageIcon, CheckCircle2, Hash, Search
} from "lucide-react";

const RichTextEditor = dynamic(() => import("@/components/RichTextEditor"), { ssr: false, loading: () => (
  <div className="h-96 bg-[#0f172a] rounded-2xl border border-white/8 flex items-center justify-center">
    <Loader2 size={24} className="animate-spin text-[#613de6]" />
  </div>
)});

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function calcReadTime(html) {
  const text = html.replace(/<[^>]*>/g, " ");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function normalizeHashtag(value) {
  const base = String(value || "")
    .trim()
    .replace(/^#+/, "")
    .replace(/,/g, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
  return base ? `#${base}` : "";
}

function normalizeHashtagList(values) {
  return [...new Set((values || []).map(normalizeHashtag).filter(Boolean))];
}

function BlogEditorContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [published, setPublished] = useState(false);
  const [author, setAuthor] = useState("Flyovahelp Team");
  const [coverImage, setCoverImage] = useState("");
  const [coverImagePath, setCoverImagePath] = useState("");
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverProgress, setCoverProgress] = useState(0);
  const [keywords, setKeywords] = useState([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [slugManual, setSlugManual] = useState(false);

  // Load existing post
  useEffect(() => {
    if (isNew) return;
    getDoc(doc(db, "blog_posts", params.id)).then((snap) => {
      if (!snap.exists()) { router.push("/admin/blog"); return; }
      const d = snap.data();
      setTitle(d.title ?? "");
      setSlug(d.slug ?? "");
      setExcerpt(d.excerpt ?? "");
      setContent(d.content ?? "");
      setPublished(d.published ?? false);
      setAuthor(d.author ?? "Flyovahelp Team");
      setCoverImage(d.coverImage ?? "");
      setCoverImagePath(d.coverImagePath ?? "");
      setKeywords(normalizeHashtagList(d.keywords ?? []));
      setMetaTitle(d.metaTitle ?? "");
      setMetaDescription(d.metaDescription ?? "");
      setLoading(false);
    });
  }, [isNew, params.id, router]);

  // Auto-slug from title
  useEffect(() => {
    if (!slugManual && title) setSlug(slugify(title));
  }, [title, slugManual]);

  const handleCoverUpload = useCallback(async (file) => {
    if (!file) return;
    setCoverUploading(true);
    setCoverProgress(0);

    // Delete old cover from Cloudinary before uploading new one
    if (coverImagePath) {
      fetch("/api/cloudinary", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId: coverImagePath }),
      }).catch(() => {});
    }

    const formData = new FormData();
    formData.append("file", file);

    // Simulate progress since fetch doesn't expose upload progress
    const progressInterval = setInterval(() => {
      setCoverProgress((p) => (p < 85 ? p + 10 : p));
    }, 200);

    try {
      const res = await fetch("/api/cloudinary", { method: "POST", body: formData });
      const data = await res.json();
      clearInterval(progressInterval);
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setCoverProgress(100);
      setCoverImage(data.url);
      setCoverImagePath(data.publicId);
    } catch (err) {
      clearInterval(progressInterval);
      console.error(err);
      alert("Cover upload failed. Please try again.");
    } finally {
      setCoverUploading(false);
    }
  }, [coverImagePath]);

  const removeCover = async () => {
    if (coverImagePath) {
      fetch("/api/cloudinary", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId: coverImagePath }),
      }).catch(() => {});
    }
    setCoverImage("");
    setCoverImagePath("");
  };

  const handleSave = async (publish) => {
    if (!title.trim()) { alert("Post title is required."); return; }
    setSaving(true);
    const normalizedKeywords = normalizeHashtagList(keywords);
    const data = {
      title: title.trim(),
      slug: slug || slugify(title),
      excerpt: excerpt.trim(),
      content,
      author: author.trim() || "Flyovahelp Team",
      coverImage,
      coverImagePath,
      keywords: normalizedKeywords,
      metaTitle: metaTitle.trim(),
      metaDescription: metaDescription.trim(),
      published: publish ?? published,
      updatedAt: serverTimestamp(),
      readTime: calcReadTime(content),
      ...(publish != null && publish && !published ? { publishedAt: serverTimestamp() } : {}),
      ...(!isNew ? {} : { createdAt: serverTimestamp() }),
    };

    try {
      if (isNew) {
        await setDoc(doc(db, "blog_posts", params.id), data);
        router.replace(`/admin/blog/${params.id}`);
      } else {
        await updateDoc(doc(db, "blog_posts", params.id), data);
        if (publish != null) setPublished(publish);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 size={28} className="animate-spin text-[#613de6]" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-0">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <button
          onClick={() => router.push("/admin/blog")}
          className="flex items-center gap-2 text-slate-400 hover:text-white text-xs font-black uppercase tracking-wider transition-colors"
        >
          <ArrowLeft size={16} /> All Posts
        </button>

        <div className="flex items-center gap-2">
          {saved && (
            <span className="flex items-center gap-1.5 text-emerald-600 text-[10px] font-black uppercase tracking-widest">
              <CheckCircle2 size={14} /> Saved
            </span>
          )}
          <button
            onClick={() => handleSave(null)}
            disabled={saving}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all border border-slate-700"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Draft
          </button>
          <button
            onClick={() => handleSave(!published)}
            disabled={saving}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all text-white shadow-lg ${
              published
                ? "bg-amber-500 hover:bg-amber-400 shadow-amber-500/20"
                : "bg-[#613de6] hover:brightness-110 shadow-[#613de6]/25"
            }`}
          >
            {published ? <><EyeOff size={14} /> Unpublish</> : <><Globe size={14} /> Publish</>}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6">
        {/* Main editor */}
        <div className="space-y-4">
          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Post Title"
            className="w-full bg-[#0f172a] border border-slate-800 rounded-2xl px-5 py-4 text-2xl font-black text-white placeholder:text-slate-500 outline-none focus:border-[#613de6]/40 transition-colors"
          />

          {/* Slug */}
          <div className="flex items-center gap-2 bg-[#0f172a] border border-slate-800 rounded-xl px-4 py-2">
            <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider shrink-0">
              /blog/
            </span>
            <input
              type="text"
              value={slug}
              onChange={(e) => { setSlug(slugify(e.target.value)); setSlugManual(true); }}
              placeholder="post-url-slug"
              className="flex-1 bg-transparent text-sm font-bold text-slate-200 placeholder:text-slate-500 outline-none"
            />
          </div>

          {/* Rich text editor */}
          <RichTextEditor
            key={isNew ? "new" : params.id}
            content={content}
            onChange={setContent}
            placeholder="Write your post here. Use the toolbar to format text, add images, and more…"
          />
        </div>

        {/* Settings panel */}
        <div className="space-y-4">
          {/* Cover image */}
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cover Image</p>
            {coverImage ? (
              <div className="relative">
                <img src={coverImage} alt="Cover" className="w-full h-40 object-cover rounded-xl" />
                <button
                  onClick={removeCover}
                  className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-lg flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-slate-700 hover:border-[#613de6]/40 rounded-xl cursor-pointer transition-colors group">
                {coverUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-[#613de6] rounded-full transition-all" style={{ width: `${coverProgress}%` }} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-400">{coverProgress}%</span>
                  </div>
                ) : (
                  <>
                    <ImageIcon size={22} className="text-slate-500 group-hover:text-[#613de6] transition-colors mb-2" />
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 group-hover:text-[#613de6] transition-colors">
                      Upload Cover
                    </span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCoverUpload(f); e.target.value = ""; }}
                />
              </label>
            )}
          </div>

          {/* Excerpt */}
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Excerpt</p>
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="Brief description shown in post listings…"
              rows={3}
              maxLength={200}
              className="w-full bg-slate-900 border border-slate-800 focus:border-[#613de6]/40 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-200 placeholder:text-slate-500 outline-none transition-colors resize-none"
            />
            <p className="text-right text-[10px] text-slate-500 font-bold">{excerpt.length}/200</p>
          </div>

          {/* Author */}
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Author</p>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 focus:border-[#613de6]/40 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-200 outline-none transition-colors"
            />
          </div>

          {/* Hashtags */}
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Hash size={13} className="text-slate-400" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Hashtags</p>
            </div>
            <div className="flex flex-wrap gap-1.5 min-h-7">
              {keywords.map((kw) => (
                <span key={kw} className="flex items-center gap-1 bg-[#613de6]/20 border border-[#613de6]/30 text-[#a78bfa] text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full">
                  {kw}
                  <button
                    type="button"
                    onClick={() => setKeywords(keywords.filter((k) => k !== kw))}
                    className="ml-0.5 hover:text-white transition-colors"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === ",") && keywordInput.trim()) {
                  e.preventDefault();
                  const kw = normalizeHashtag(keywordInput);
                  if (kw && !keywords.includes(kw)) setKeywords([...keywords, kw]);
                  setKeywordInput("");
                } else if (e.key === "Backspace" && !keywordInput && keywords.length) {
                  setKeywords(keywords.slice(0, -1));
                }
              }}
              placeholder="Type hashtag, press Enter…"
              className="w-full bg-slate-900 border border-slate-800 focus:border-[#613de6]/40 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-200 placeholder:text-slate-500 outline-none transition-colors"
            />
            <p className="text-[10px] text-slate-500 font-bold">Auto-formats to #hashtag · Press Enter/comma to add</p>
          </div>

          {/* SEO / Meta Tags */}
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Search size={13} className="text-slate-400" />
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">SEO / Meta Tags</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Meta Title</label>
              <input
                type="text"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                placeholder={title || "Defaults to post title"}
                maxLength={70}
                className="w-full bg-slate-900 border border-slate-800 focus:border-[#613de6]/40 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-200 placeholder:text-slate-500 outline-none transition-colors"
              />
              <p className={`text-right text-[10px] font-bold ${metaTitle.length > 60 ? "text-amber-400" : "text-slate-500"}`}>
                {metaTitle.length}/70 {metaTitle.length > 60 ? "· trim for best SEO" : ""}
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Meta Description</label>
              <textarea
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                placeholder={excerpt || "Defaults to excerpt"}
                rows={3}
                maxLength={160}
                className="w-full bg-slate-900 border border-slate-800 focus:border-[#613de6]/40 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-200 placeholder:text-slate-500 outline-none transition-colors resize-none"
              />
              <p className={`text-right text-[10px] font-bold ${metaDescription.length > 155 ? "text-amber-400" : "text-slate-500"}`}>
                {metaDescription.length}/160 {metaDescription.length > 155 ? "· trim for best SEO" : ""}
              </p>
            </div>
          </div>

          {/* Status */}
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</p>
              <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${published ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-700/40 text-slate-300"}`}>
                {published ? "Published" : "Draft"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BlogEditorPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-96"><Loader2 size={24} className="animate-spin text-[#613de6]" /></div>}>
      <BlogEditorContent />
    </Suspense>
  );
}
