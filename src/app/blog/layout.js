export const metadata = {
  title: "Blog",
  description:
    "Read StraWins blog posts on gaming tips, prediction strategies, platform updates, and player guides.",
  keywords: [
    "StraWins blog",
    "gaming tips",
    "prediction game strategy",
    "online gaming news",
    "play and earn guide",
  ],
  alternates: {
    canonical: "https://strawins.com/blog",
  },
  openGraph: {
    title: "StraWins Blog | Tips, Strategies, and Updates",
    description:
      "Latest tips, game guides, and platform updates from StraWins.",
    url: "https://strawins.com/blog",
    type: "website",
  },
};

export default function BlogLayout({ children }) {
  return children;
}
