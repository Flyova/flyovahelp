/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  
  async redirects() {
    return [
      // 1. Catch-all for any old PHP files (e.g., login.php, index.php, etc.)
      {
        source: '/:path*.php',
        destination: '/',
        permanent: true, // This tells Google it's a 301 (Permanent) redirect
      },
      // 2. Specific example: if you had a folder like /old-site/page
      // {
      //   source: '/old-site/:path*',
      //   destination: '/',
      //   permanent: true,
      // },
    ];
  },
};

export default nextConfig;