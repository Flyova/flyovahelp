import Link from "next/link";
import { ArrowLeft, ArrowRight, ShieldCheck, Trophy, Users, Zap } from "lucide-react";

const PAGE_URL = "https://flyovahelp.com/about";
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
      name: "About Us",
      item: PAGE_URL,
    },
  ],
};

export const metadata = {
  title: "About Us",
  description:
    "Learn more about Flyovahelp, our mission, and how we build a trusted mobile-first gaming and rewards platform.",
  keywords: [
    "about Flyovahelp",
    "Flyovahelp mission",
    "gaming platform company",
    "mobile gaming Nigeria",
  ],
  alternates: {
    canonical: PAGE_URL,
  },
  openGraph: {
    title: "About Flyovahelp",
    description:
      "Discover the mission, values, and vision behind Flyovahelp.",
    url: PAGE_URL,
    type: "website",
  },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <section className="max-w-6xl mx-auto px-6 py-10 md:py-14">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-white/70 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
          Back Home
        </Link>

        <div className="mt-8 md:mt-12 max-w-3xl">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400 mb-3">About Us</p>
          <h1 className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter leading-tight">
            About <span className="text-[#fc7952]">Flyovahelp</span>
          </h1>
          <p className="mt-5 text-sm md:text-lg text-white/75 font-bold leading-relaxed">
            Flyovahelp is a mobile-first gaming and rewards platform built for speed, transparency, and simple payouts.
            We created the experience so players can join quickly, play confidently, and withdraw without stress.
          </p>
        </div>

        <div className="mt-10 grid md:grid-cols-2 gap-4">
          {[
            {
              icon: <Zap size={20} />,
              title: "Fast Gameplay",
              text: "Quick-entry games with real-time rounds and smooth mobile performance.",
            },
            {
              icon: <ShieldCheck size={20} />,
              title: "Transparent System",
              text: "All core actions are tracked, and payout flows are monitored end-to-end.",
            },
            {
              icon: <Users size={20} />,
              title: "Community Powered",
              text: "Verified agents and active players keep the platform vibrant and responsive.",
            },
            {
              icon: <Trophy size={20} />,
              title: "Built To Reward",
              text: "From game wins to bonus opportunities, we focus on rewarding engagement.",
            },
          ].map((item) => (
            <div key={item.title} className="bg-[#1e293b] border border-white/5 rounded-2xl p-6">
              <div className="w-10 h-10 rounded-xl bg-[#613de6]/20 text-[#a78bfa] flex items-center justify-center mb-4">
                {item.icon}
              </div>
              <h2 className="text-lg font-black italic uppercase tracking-tighter">{item.title}</h2>
              <p className="mt-2 text-xs font-bold text-white/65 leading-relaxed">{item.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 bg-[#1e293b] border border-white/5 rounded-3xl p-7 md:p-10">
          <h3 className="text-2xl md:text-3xl font-black italic uppercase tracking-tighter">
            Our Mission
          </h3>
          <p className="mt-3 text-sm md:text-base font-bold text-white/75 leading-relaxed max-w-3xl">
            We are building a trusted ecosystem where entertainment and earning can coexist.
            Our focus is clear: fair gameplay, reliable operations, and better user confidence every day.
          </p>
          <div className="mt-7 flex flex-col sm:flex-row gap-3">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 bg-[#fc7952] hover:bg-[#fd8a6a] text-white px-8 py-4 rounded-full font-black text-sm uppercase tracking-wider transition-all active:scale-95"
            >
              Create Account
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/support"
              className="inline-flex items-center justify-center gap-2 border border-white/25 text-white px-8 py-4 rounded-full font-black text-sm uppercase tracking-wider hover:bg-white/10 transition-all active:scale-95"
            >
              Contact Support
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
