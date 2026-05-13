import "./globals.css";
import ClientLayoutShell from "./ClientLayoutShell";

const SITE_URL = "https://flyovahelp.com";
const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Flyovahelp",
  url: SITE_URL,
  inLanguage: "en",
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Flyovahelp",
  url: SITE_URL,
  logo: `${SITE_URL}/logo.svg`,
  sameAs: [
    "https://www.facebook.com/share/18nRMrs7P5/",
    "https://www.instagram.com/flyovahelp1?igsh=MW5ubDB1Z2tueHhuaQ==",
    "https://www.tiktok.com/@flyovahelp1?_r=1&_t=ZN-96IBVFFEsp4",
    "https://x.com/flyovahelp",
  ],
};

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Flyovahelp | Online Gaming, Predictions, and Real-Money Challenges",
    template: "%s | Flyovahelp",
  },
  description:
    "Flyovahelp is a mobile-first gaming platform where you can play prediction games, compete in multiplayer challenges, and withdraw winnings quickly.",
  keywords: [
    "Flyovahelp",
    "online gaming platform",
    "predict and win",
    "real money games",
    "multiplayer betting",
    "Nigeria gaming app",
    "play and earn",
    "instant withdrawals",
    "mobile gaming",
    "online game challenges",
  ],
  openGraph: {
    title: "Flyovahelp | Online Gaming, Predictions, and Real-Money Challenges",
    description:
      "Play prediction games, join live challenges, and withdraw winnings on Flyovahelp.",
    url: SITE_URL,
    siteName: "Flyovahelp",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Flyovahelp | Online Gaming, Predictions, and Real-Money Challenges",
    description:
      "Play prediction games, join live challenges, and withdraw winnings on Flyovahelp.",
  },
  alternates: {
    canonical: SITE_URL,
  },
  category: "gaming",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      <body className="bg-[#0f172a] antialiased">
        <ClientLayoutShell>{children}</ClientLayoutShell>
      </body>
    </html>
  );
}
