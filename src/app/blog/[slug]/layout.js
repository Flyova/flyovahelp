const SITE_URL = "https://strawins.com";

function slugToTitle(slug = "") {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  const slug = resolvedParams?.slug || "post";
  const prettyTitle = slugToTitle(slug) || "Blog Post";
  const canonical = `${SITE_URL}/blog/${slug}`;

  return {
    title: prettyTitle,
    description: `Read ${prettyTitle} on StraWins Blog for gaming tips, strategies, and updates.`,
    alternates: {
      canonical,
    },
    openGraph: {
      title: `${prettyTitle} | StraWins Blog`,
      description: `Read ${prettyTitle} on StraWins Blog.`,
      url: canonical,
      type: "article",
    },
  };
}

export default function BlogPostLayout({ children }) {
  return children;
}
