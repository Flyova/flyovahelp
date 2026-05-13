import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const PAGE_URL = "https://flyovahelp.com/faq";

const FAQ_ITEMS = [
  {
    q: "How does deposit work?",
    a: "Proceed to deposit using your verified crypto wallet or a verified Flyova Agent in your region. Deposits are processed in less than 30 minutes.",
  },
  {
    q: "How does withdrawal work?",
    a: "Request a withdrawal from your wallet to your verified crypto wallet or a verified Flyova Agent in your region. Agent payouts are completed within minutes.",
  },
  {
    q: "What is a Flyova Agent?",
    a: "Agents are verified community members who process deposits and withdrawals. They earn a commission on every transaction they handle.",
  },
  {
    q: "How do I transfer money to another user?",
    a: "Instantly transfer using the recipient's 8-digit account pin. No admin approval needed.",
  },
  {
    q: "Can I stake on my own?",
    a: "Yes. Flyova provides medium for users to stake on their own as many times and anytime as possible.",
  },
  {
    q: "How much do I need to play Flyova games?",
    a: "Deposit as low as 10.00 USD to start your journey on Flyovahelp. Minimum deposit starts from 1.00 USD.",
  },
  {
    q: "Is there free prediction days?",
    a: "Absolutely. Flyova admins offer daily free predictions on weekdays and weekends.",
  },
  {
    q: "Which country is eligible to create Flyova account?",
    a: "Everyone, regardless of country, can own a verified Flyova account.",
  },
  {
    q: "What do I need to apply as a Flyova Agent?",
    a: "Just a verified Flyova account, age qualification and trustworthiness.",
  },
  {
    q: "What are the withdrawal days?",
    a: "Flyova do not have any specific days or time for withdrawal. Users can withdraw anytime and any-day.",
  },
  {
    q: "How do I earn jackpot?",
    a: "Participate on Flyova activities including referral programs, advertising, deposits, stakes, etc to earn.",
  },
];

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://flyovahelp.com/" },
    { "@type": "ListItem", position: 2, name: "FAQ", item: PAGE_URL },
  ],
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.a,
    },
  })),
};

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <section className="max-w-5xl mx-auto px-6 py-10 md:py-14">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-white/70 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Dashboard
        </Link>

        <div className="mt-8 md:mt-12 max-w-3xl">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#fc7952] mb-3">FAQ</p>
          <h1 className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter leading-tight">
            Everything You Need to <span className="text-[#a78bfa]">Know</span>
          </h1>
          <p className="mt-4 text-sm md:text-base text-white/70 font-bold">
            Quick answers to the most common questions from Flyovahelp users.
          </p>
        </div>

        <div className="mt-8 space-y-3">
          {FAQ_ITEMS.map((item) => (
            <article key={item.q} className="bg-[#1e293b] border border-white/5 rounded-2xl p-5">
              <h2 className="text-sm md:text-base font-black italic uppercase tracking-tight text-white">
                {item.q}
              </h2>
              <p className="mt-2 text-xs md:text-sm font-bold text-white/70 leading-relaxed">
                {item.a}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
