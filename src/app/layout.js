import "./globals.css";
import Script from "next/script";
import ClientLayoutShell from "./ClientLayoutShell";

const SITE_URL = "https://strawins.com";
const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "StraWins",
  url: SITE_URL,
  inLanguage: "en",
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "StraWins",
  url: SITE_URL,
  logo: `${SITE_URL}/logo.svg`,
  sameAs: [
    "https://www.facebook.com/share/18nRMrs7P5/",
    "https://www.instagram.com/flyovahelp1?igsh=MW5ubDB1Z2tueHhuaQ==",
    "https://www.tiktok.com/@flyovahelp1?_r=1&_t=ZN-96IBVFFEsp4",
    "https://x.com/flyovahelp",
  ],
};

const GA_MEASUREMENT_ID = "G-CQJ8Q6NRDD";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "StraWins | Online Gaming, Predictions, and Real-Money Challenges",
    template: "%s | StraWins",
  },
  description:
    "StraWins is a mobile-first gaming platform where you can play prediction games, compete in multiplayer challenges, and withdraw winnings quickly.",
  keywords: [
    "StraWins",
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
    title: "StraWins | Online Gaming, Predictions, and Real-Money Challenges",
    description:
      "Play prediction games, join live challenges, and withdraw winnings on StraWins.",
    url: SITE_URL,
    siteName: "StraWins",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "StraWins | Online Gaming, Predictions, and Real-Money Challenges",
    description:
      "Play prediction games, join live challenges, and withdraw winnings on StraWins.",
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700;1,800;1,900&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      <body className="bg-[#0B1220] text-[#F5F3EE] antialiased" style={{ fontFamily: "Montserrat, ui-sans-serif, system-ui, sans-serif" }}>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
        <ClientLayoutShell>{children}</ClientLayoutShell>
      </body>
    </html>
  );
}
