import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const PAGE_URL = "https://strawins.com/faq";

const FAQ_ITEMS = [
  {
    q: "How do I get started?",
    a: "Create a free account, deposit funds into your wallet, and jump straight into any game. Setup takes under 2 minutes.",
  },
  {
    q: "How does deposit work?",
    a: "Proceed to deposit using your verified crypto wallet or a verified StraWins Agent in your region. Deposits are processed in less than 30 minutes.",
  },
  {
    q: "How does withdrawal work?",
    a: "Request a withdrawal from your wallet to your verified crypto wallet or a verified StraWins Agent in your region. Agent payouts are completed within minutes.",
  },
  {
    q: "What is a StraWins Agent?",
    a: "Agents are verified community members who process deposits and withdrawals. They earn a commission on every transaction they handle.",
  },
  {
    q: "How do I transfer money to another user?",
    a: "Instantly transfer using the recipient's 8-digit account pin and your own 4-digit transaction PIN (set it in Settings). No admin approval needed.",
  },
  {
    q: "Can I stake on my own?",
    a: "Yes. StraWins provides medium for users to stake on their own as many times and anytime as possible.",
  },
  {
    q: "How much do I need to play StraWins games?",
    a: "Deposit as low as 1.00 USD with a local agent (10.00 USD with USDT) to start your journey on StraWins. Minimum stake starts from 1.00 USD.",
  },
  {
    q: "Is there free prediction days?",
    a: "Absolutely. StraWins admins offer daily free predictions on weekdays and weekends.",
  },
  {
    q: "Which country is eligible to create StraWins account?",
    a: "Everyone, regardless of country, can own a verified StraWins account.",
  },
  {
    q: "What do I need to apply as a StraWins Agent?",
    a: "A verified StraWins account, age qualification (18+), your ID photos and trustworthiness. Registration costs $50 from your wallet, refunded in full if your application isn't approved.",
  },
  {
    q: "What are the withdrawal days?",
    a: "StraWins do not have any specific days or time for withdrawal. Users can withdraw anytime and any-day.",
  },
  {
    q: "How do I earn jackpot?",
    a: "Participate on StraWins activities including referral programs, advertising, deposits, stakes, etc to earn.",
  },
  {
    q: "Why do I need a 4-digit PIN?",
    a: "Every transfer and withdrawal asks for your transaction PIN, so nobody else can move your money even if they get into your account. Set or reset it in Settings.",
  },
  {
    q: "Do I need a bank account to use an agent?",
    a: "Yes. Add your bank account in Settings before depositing or withdrawing with an agent. It must be in your own name — the name on your StraWins account.",
  },
  {
    q: "What happens if I start a deposit and don't pay?",
    a: "Only start a deposit when you're ready to pay. If 3 deposit requests in 24 hours go unpaid, deposits are locked for 48 hours.",
  },
  {
    q: "How do referral rewards work?",
    a: "You earn $0.0001 for every player who signs up with your link or referral code (they're kept separately as sign-up rewards), plus a commission on your referrals' deposits. Your referral balance unlocks once 10 of your referrals have each deposited at least $25.",
  },
  {
    q: "What happens in StraWins to Dollars if only one of my numbers comes up?",
    a: "Match both numbers to win 1.3× your stake. Match one and you get 92% of your stake back.",
  },
  {
    q: "Is my money safe?",
    a: "Yes. All transactions are logged and monitored. Our agent system is verified and every payout is tracked end-to-end.",
  },
  {
    q: "Can I play on mobile?",
    a: "Absolutely. StraWins is built mobile-first and works perfectly on any smartphone or tablet browser.",
  },
];

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://strawins.com/" },
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
    <div className="min-h-screen bg-[#0B1220] text-white">
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
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#8B1E3F] mb-3">FAQ</p>
          <h1 className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter leading-tight">
            Everything You Need to <span className="text-[#7A9BEE]">Know</span>
          </h1>
          <p className="mt-4 text-sm md:text-base text-white/70 font-bold">
            Quick answers to the most common questions from StraWins users.
          </p>
        </div>

        <div className="mt-8 space-y-3">
          {FAQ_ITEMS.map((item) => (
            <article key={item.q} className="bg-[#142036] border border-white/5 rounded-2xl p-5">
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
