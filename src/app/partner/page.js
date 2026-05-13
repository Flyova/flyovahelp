"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft, ArrowRight, Handshake, TrendingUp, ShieldCheck,
  Users, DollarSign, Layers, Mail, CheckCircle2, Link2, Megaphone
} from "lucide-react";

const CONTACT_EMAIL = "info@flyovahelp.com";
const PAGE_URL = "https://flyovahelp.com/partner";
const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://flyovahelp.com/",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Partner with Us",
      item: PAGE_URL,
    },
  ],
};

const MODELS = [
  {
    icon: <DollarSign size={22} className="text-[#34d399]" />,
    title: "Affiliate Program",
    desc: "Refer players to Flyovahelp and earn a percentage of every transaction they make. No cap on earnings.",
    tag: "Revenue Share",
    tagColor: "#34d399",
  },
  {
    icon: <Layers size={22} className="text-[#a78bfa]" />,
    title: "White-Label",
    desc: "Launch your own branded gaming platform powered by our infrastructure. Your brand, our engine.",
    tag: "Enterprise",
    tagColor: "#a78bfa",
  },
  {
    icon: <Megaphone size={22} className="text-[#fc7952]" />,
    title: "Co-Marketing",
    desc: "Joint campaigns, giveaways, or sponsored events that expose both brands to new audiences.",
    tag: "Brand Growth",
    tagColor: "#fc7952",
  },
  {
    icon: <Link2 size={22} className="text-[#fbbf24]" />,
    title: "Integration Partner",
    desc: "Build on top of Flyovahelp via API access. Add wallet features, game embeds, or data pipelines to your product.",
    tag: "Tech",
    tagColor: "#fbbf24",
  },
];

const BENEFITS = [
  "Dedicated partner manager from day one",
  "Access to platform analytics relevant to your integration",
  "Co-branded marketing materials on request",
  "Priority support and direct Slack/WhatsApp line",
  "Revenue-share arrangements reviewed quarterly",
  "Early access to new games and features",
];

const PROCESS = [
  { step: "01", title: "Apply", desc: "Send us a brief intro about your company and the type of partnership you're exploring." },
  { step: "02", title: "Discovery Call", desc: "We schedule a short call to understand your goals and align on the right model." },
  { step: "03", title: "Agreement", desc: "We draft a clear, straightforward partnership agreement. No fluff." },
  { step: "04", title: "Launch", desc: "Go live. Our team supports integration, co-marketing, or onboarding end-to-end." },
];

export default function PartnerPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", company: "", type: "", message: "" });

  const handleSend = () => {
    const subject = encodeURIComponent(`Partnership Inquiry — ${form.company || form.name}`);
    const body = encodeURIComponent(
      `Hi Flyovahelp Partnerships Team,\n\nName: ${form.name}\nCompany: ${form.company}\nPartnership Type: ${form.type}\n\n${form.message}\n\nLooking forward to connecting.`
    );
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  };

  const canSend = form.name.trim() && form.message.trim();

  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {/* NAV */}
      <div className="sticky top-0 z-50 bg-[#0f172a]/90 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <Image src="/logo.svg" alt="Flyovahelp" width={110} height={28} />
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="hidden sm:flex items-center gap-2 bg-[#613de6] text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider hover:brightness-110 transition-all"
        >
          <Mail size={14} /> Email Us
        </a>
      </div>

      {/* HERO */}
      <section className="relative overflow-hidden px-6 py-20 text-center">
        <div className="absolute inset-0 pointer-events-none select-none flex items-center justify-center">
          <span className="text-[22vw] font-black italic uppercase tracking-tighter text-white/[0.025] whitespace-nowrap leading-none">
            COLLAB
          </span>
        </div>
        <div className="relative z-10 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-[#613de6]/15 border border-[#613de6]/30 text-[#a78bfa] text-[10px] font-black uppercase tracking-[0.25em] px-4 py-2 rounded-full mb-6">
            <Handshake size={12} /> Partner with Us
          </div>
          <h1 className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter leading-none mb-4">
            Grow Together<br />
            <span className="text-[#a78bfa]">Build Together</span>
          </h1>
          <p className="text-gray-400 text-sm md:text-base font-bold max-w-lg mx-auto leading-relaxed">
            Whether you're building a product, running a brand, or growing a community — there's a partnership model designed for you.
          </p>
          <button
            onClick={() => document.getElementById("contact-form")?.scrollIntoView({ behavior: "smooth" })}
            className="mt-8 inline-flex items-center gap-2 bg-[#613de6] text-white px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-wider hover:brightness-110 transition-all shadow-xl shadow-[#613de6]/30"
          >
            Explore Partnership <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* PARTNERSHIP MODELS */}
      <section className="bg-[#1e293b] border-y border-white/5 px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-500 mb-2">Models</p>
          <h2 className="text-3xl font-black italic uppercase tracking-tighter mb-10">
            How We Can Work Together
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {MODELS.map((m) => (
              <div
                key={m.title}
                className="bg-[#0f172a] border border-white/5 rounded-2xl p-6 hover:border-white/15 transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="bg-white/5 w-11 h-11 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    {m.icon}
                  </div>
                  <span
                    className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
                    style={{ background: `${m.tagColor}18`, color: m.tagColor, border: `1px solid ${m.tagColor}30` }}
                  >
                    {m.tag}
                  </span>
                </div>
                <h3 className="font-black text-base text-white mb-2">{m.title}</h3>
                <p className="text-xs text-gray-400 font-bold leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BENEFITS */}
      <section className="px-6 py-16 max-w-3xl mx-auto">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-500 mb-2">What You Get</p>
        <h2 className="text-3xl font-black italic uppercase tracking-tighter mb-8">
          Partner Benefits
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {BENEFITS.map((b) => (
            <div key={b} className="flex items-start gap-3 bg-[#1e293b] border border-white/5 rounded-xl p-4">
              <CheckCircle2 size={16} className="text-[#613de6] shrink-0 mt-0.5" />
              <p className="text-xs font-bold text-gray-300">{b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PROCESS */}
      <section className="bg-[#1e293b] border-y border-white/5 px-6 py-16">
        <div className="max-w-3xl mx-auto">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-500 mb-2">The Process</p>
          <h2 className="text-3xl font-black italic uppercase tracking-tighter mb-10">
            How It Works
          </h2>
          <div className="space-y-0">
            {PROCESS.map((p, i) => (
              <div key={p.step} className="flex gap-6 relative">
                {/* Connector line */}
                {i < PROCESS.length - 1 && (
                  <div className="absolute left-[22px] top-12 w-px h-full bg-[#613de6]/30" />
                )}
                <div className="shrink-0 w-11 h-11 rounded-2xl bg-[#613de6]/20 border border-[#613de6]/40 flex items-center justify-center">
                  <span className="text-[10px] font-black text-[#a78bfa]">{p.step}</span>
                </div>
                <div className="pb-10">
                  <h3 className="font-black text-white text-base mb-1">{p.title}</h3>
                  <p className="text-xs text-gray-400 font-bold leading-relaxed">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT FORM */}
      <section id="contact-form" className="px-6 py-16 max-w-2xl mx-auto">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-500 mb-2">Apply</p>
        <h2 className="text-3xl font-black italic uppercase tracking-tighter mb-2">
          Start a Conversation
        </h2>
        <p className="text-xs text-gray-400 font-bold mb-8">
          Tell us about your company. We respond to every serious inquiry within 48 hours.
        </p>

        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1.5">Your Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Jane Smith"
                className="w-full bg-[#1e293b] border border-white/5 focus:border-[#613de6]/50 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none transition-colors placeholder:text-gray-600"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1.5">Company / Brand *</label>
              <input
                type="text"
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                placeholder="Your Company"
                className="w-full bg-[#1e293b] border border-white/5 focus:border-[#613de6]/50 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none transition-colors placeholder:text-gray-600"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1.5">Partnership Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="w-full bg-[#1e293b] border border-white/5 focus:border-[#613de6]/50 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none transition-colors"
            >
              <option value="" className="bg-[#1e293b]">Select a model…</option>
              <option value="Affiliate Program" className="bg-[#1e293b]">Affiliate Program</option>
              <option value="White-Label" className="bg-[#1e293b]">White-Label</option>
              <option value="Co-Marketing" className="bg-[#1e293b]">Co-Marketing</option>
              <option value="Integration / API" className="bg-[#1e293b]">Integration / API</option>
              <option value="Other" className="bg-[#1e293b]">Other</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1.5">Message *</label>
            <textarea
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              placeholder="Briefly describe your company, your goal, and how you see a partnership working..."
              rows={5}
              className="w-full bg-[#1e293b] border border-white/5 focus:border-[#613de6]/50 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none transition-colors placeholder:text-gray-600 resize-none"
            />
          </div>

          <button
            onClick={handleSend}
            disabled={!canSend}
            className="w-full flex items-center justify-center gap-2 bg-[#613de6] hover:brightness-110 disabled:opacity-40 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-wider transition-all shadow-xl shadow-[#613de6]/30 active:scale-95"
          >
            <Mail size={16} /> Send Application
          </button>

          <p className="text-center text-[11px] text-gray-500 font-bold">
            Or email us directly at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#a78bfa] hover:underline">
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </section>

      {/* FOOTER STRIP */}
      <div className="border-t border-white/5 px-6 py-6 text-center">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-600">
          © 2026 Flyovahelp Arena · All rights reserved
        </p>
      </div>
    </div>
  );
}
