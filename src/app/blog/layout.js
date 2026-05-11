export const metadata = {
  title: "Blog",
  description:
    "Read Flyovahelp blog posts on gaming tips, prediction strategies, platform updates, and player guides.",
  keywords: [
    "Flyovahelp blog",
    "gaming tips",
    "prediction game strategy",
    "online gaming news",
    "play and earn guide",
  ],
  alternates: {
    canonical: "https://flyovahelp.com/blog",
  },
  openGraph: {
    title: "Flyovahelp Blog | Tips, Strategies, and Updates",
    description:
      "Latest tips, game guides, and platform updates from Flyovahelp.",
    url: "https://flyovahelp.com/blog",
    type: "website",
  },
};

export default function BlogLayout({ children }) {
  return children;
}
