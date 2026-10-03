const PAGE_URL = "https://strawins.com/faq";

export const metadata = {
  title: "FAQ",
  description:
    "Get answers to common StraWins questions about deposits, withdrawals, agents, staking, referrals, and account access.",
  keywords: [
    "StraWins FAQ",
    "StraWins deposit",
    "StraWins withdrawal",
    "StraWins agent",
    "StraWins support",
  ],
  alternates: {
    canonical: PAGE_URL,
  },
  openGraph: {
    title: "StraWins FAQ",
    description:
      "Everything you need to know about how StraWins works.",
    url: PAGE_URL,
    type: "website",
  },
};

export default function FaqLayout({ children }) {
  return children;
}
