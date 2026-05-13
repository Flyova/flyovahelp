export default function sitemap() {
  const baseUrl = "https://flyovahelp.com";
  const now = new Date();

  const publicRoutes = ["/", "/about", "/faq", "/blog", "/advertise", "/partner", "/login", "/register", "/forgot-password"];

  return publicRoutes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: now,
    changeFrequency: route === "/" ? "daily" : "weekly",
    priority: route === "/" ? 1 : 0.7,
  }));
}
