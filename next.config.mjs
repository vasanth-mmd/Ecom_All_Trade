/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return {
      // beforeFiles is REQUIRED here: these paths exist as physical files in
      // /public, and Next serves public files before normal rewrites. beforeFiles
      // rewrites run first, so the database-backed API wins over the old files.
      beforeFiles: [
        { source: "/app/data.json", destination: "/api/data" },
        { source: "/app/data.js", destination: "/api/datajs" },
      ],
    };
  },
};

export default nextConfig;
  