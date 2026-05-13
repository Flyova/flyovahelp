const PAGE_URL = "https://flyovahelp.com/faq";

export const metadata = {
  title: "FAQ",
  description:
    "Get answers to common Flyovahelp questions about deposits, withdrawals, agents, staking, referrals, and account access.",
  keywords: [
    "Flyovahelp FAQ",
    "Flyovahelp deposit",
    "Flyovahelp withdrawal",
    "Flyovahelp agent",
    "Flyovahelp support",
  ],
  alternates: {
    canonical: PAGE_URL,
  },
  openGraph: {
    title: "Flyovahelp FAQ",
    description:
      "Everything you need to know about how Flyovahelp works.",
    url: PAGE_URL,
    type: "website",
  },
};

export default function FaqLayout({ children }) {
  return children;
}
