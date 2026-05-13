const SITE_URL = "https://flyovahelp.com";

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
    description: `Read ${prettyTitle} on Flyovahelp Blog for gaming tips, strategies, and updates.`,
    alternates: {
      canonical,
    },
    openGraph: {
      title: `${prettyTitle} | Flyovahelp Blog`,
      description: `Read ${prettyTitle} on Flyovahelp Blog.`,
      url: canonical,
      type: "article",
    },
  };
}

export default function BlogPostLayout({ children }) {
  return children;
}
