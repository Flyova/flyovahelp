"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft, ArrowRight, Users, TrendingUp, Zap,
  Target, BarChart2, Mail, CheckCircle2, Globe, Smartphone
} from "lucide-react";

const CONTACT_EMAIL = "advertise@flyovahelp.com";

const STATS = [
  { value: "50K+", label: "Active Players" },
  { value: "3M+", label: "Monthly Rounds" },
  { value: "18–35", label: "Core Age Group" },
  { value: "95%", label: "Mobile Users" },
];

const AD_FORMATS = [
  {
    icon: <Smartphone size={22} className="text-[#fc7952]" />,
    title: "In-App Banner",
    desc: "High-visibility banners placed across the dashboard, game lobbies, and history feed. Seen by every active session.",
  },
  {
    icon: <Zap size={22} className="text-[#a78bfa]" />,
    title: "Game Sponsorship",
    desc: "Sponsor a game round. Your brand name and logo appear as the round title, seen by all players in that session.",
  },
  {
    icon: <Globe size={22} className="text-[#34d399]" />,
    title: "Community Blast",
    desc: "Broadcast your message directly to our Telegram group and in-app chatroom with a pinned announcement.",
  },
  {
    icon: <Target size={22} className="text-[#fbbf24]" />,
    title: "Landing Page Feature",
    desc: "Featured placement on our public landing page — visible to both registered users and new visitors.",
  },
];

const PERKS = [
  "Direct access to a highly engaged gaming audience",
  "Flexible campaigns — short burst or long-term",
  "Transparent reporting on impressions and clicks",
  "No middlemen — work directly with our team",
  "Custom creative support available on request",
];

export default function AdvertisePage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", company: "", budget: "", message: "" });

  const handleSend = () => {
    const subject = encodeURIComponent(`Advertising Inquiry — ${form.company || form.name}`);
    const body = encodeURIComponent(
      `Hi Flyovahelp Team,\n\nName: ${form.name}\nCompany: ${form.company}\nBudget: ${form.budget}\n\n${form.message}\n\nLooking forward to hearing from you.`
    );
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  };

  const canSend = form.name.trim() && form.message.trim();

  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
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
          className="hidden sm:flex items-center gap-2 bg-[#fc7952] text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider hover:brightness-110 transition-all"
        >
          <Mail size={14} /> Email Us
        </a>
      </div>

      {/* HERO */}
      <section className="relative overflow-hidden px-6 py-20 text-center">
        <div className="absolute inset-0 pointer-events-none select-none flex items-center justify-center">
          <span className="text-[22vw] font-black italic uppercase tracking-tighter text-white/[0.025] whitespace-nowrap leading-none">
            ADS
          </span>
        </div>
        <div className="relative z-10 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-[#fc7952]/15 border border-[#fc7952]/30 text-[#fc7952] text-[10px] font-black uppercase tracking-[0.25em] px-4 py-2 rounded-full mb-6">
            <BarChart2 size={12} /> Advertise with Us
          </div>
          <h1 className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter leading-none mb-4">
            Reach Players<br />
            <span className="text-[#fc7952]">Where They Play</span>
          </h1>
          <p className="text-gray-400 text-sm md:text-base font-bold max-w-lg mx-auto leading-relaxed">
            Put your brand in front of thousands of active, high-intent gaming enthusiasts across Nigeria. Every session. Every game.
          </p>
          <button
            onClick={() => document.getElementById("contact-form")?.scrollIntoView({ behavior: "smooth" })}
            className="mt-8 inline-flex items-center gap-2 bg-[#fc7952] text-white px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-wider hover:brightness-110 transition-all shadow-xl shadow-[#fc7952]/20"
          >
            Get Started <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* STATS BAR */}
      <section className="bg-[#1e293b] border-y border-white/5 px-6 py-10">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-3xl md:text-4xl font-black italic text-white tracking-tighter">{s.value}</p>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* AD FORMATS */}
      <section className="px-6 py-16 max-w-4xl mx-auto">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-500 mb-2">What We Offer</p>
        <h2 className="text-3xl font-black italic uppercase tracking-tighter mb-10">
          Ad Formats
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {AD_FORMATS.map((f) => (
            <div
              key={f.title}
              className="bg-[#1e293b] border border-white/5 rounded-2xl p-6 hover:border-white/15 transition-all group"
            >
              <div className="bg-white/5 w-11 h-11 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                {f.icon}
              </div>
              <h3 className="font-black text-base text-white mb-2">{f.title}</h3>
              <p className="text-xs text-gray-400 font-bold leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WHY ADVERTISE */}
      <section className="bg-[#1e293b] border-y border-white/5 px-6 py-16">
        <div className="max-w-3xl mx-auto">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-500 mb-2">Why Us</p>
          <h2 className="text-3xl font-black italic uppercase tracking-tighter mb-8">
            Why Advertise on<br /><span className="text-[#fc7952]">Flyovahelp?</span>
          </h2>
          <div className="space-y-4">
            {PERKS.map((perk) => (
              <div key={perk} className="flex items-start gap-3">
                <CheckCircle2 size={18} className="text-[#fc7952] shrink-0 mt-0.5" />
                <p className="text-sm font-bold text-gray-300">{perk}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT FORM */}
      <section id="contact-form" className="px-6 py-16 max-w-2xl mx-auto">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-500 mb-2">Get in Touch</p>
        <h2 className="text-3xl font-black italic uppercase tracking-tighter mb-2">
          Let's Talk
        </h2>
        <p className="text-xs text-gray-400 font-bold mb-8">
          Fill in the form and we'll open your email client with everything pre-filled, ready to send.
        </p>

        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1.5">Your Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="John Doe"
                className="w-full bg-[#1e293b] border border-white/5 focus:border-[#fc7952]/50 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none transition-colors placeholder:text-gray-600"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1.5">Company / Brand</label>
              <input
                type="text"
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                placeholder="Acme Corp"
                className="w-full bg-[#1e293b] border border-white/5 focus:border-[#fc7952]/50 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none transition-colors placeholder:text-gray-600"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1.5">Estimated Budget</label>
            <input
              type="text"
              value={form.budget}
              onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
              placeholder="e.g. ₦50,000 – ₦200,000/month"
              className="w-full bg-[#1e293b] border border-white/5 focus:border-[#fc7952]/50 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none transition-colors placeholder:text-gray-600"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 block mb-1.5">Message *</label>
            <textarea
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              placeholder="Tell us about your product, target audience, and what you're looking to achieve..."
              rows={5}
              className="w-full bg-[#1e293b] border border-white/5 focus:border-[#fc7952]/50 rounded-xl px-4 py-3 text-sm font-bold text-white outline-none transition-colors placeholder:text-gray-600 resize-none"
            />
          </div>

          <button
            onClick={handleSend}
            disabled={!canSend}
            className="w-full flex items-center justify-center gap-2 bg-[#fc7952] hover:brightness-110 disabled:opacity-40 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-wider transition-all shadow-xl shadow-[#fc7952]/20 active:scale-95"
          >
            <Mail size={16} /> Send Inquiry
          </button>

          <p className="text-center text-[11px] text-gray-500 font-bold">
            Or email us directly at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#fc7952] hover:underline">
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
