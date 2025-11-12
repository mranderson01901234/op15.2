import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Increase body size limit for PDF uploads (50MB max)
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // Explicitly set the workspace root to avoid detection issues
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
