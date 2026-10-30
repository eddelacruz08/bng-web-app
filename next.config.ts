import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages are client-driven (live WebSocket state), so the newer server
  // caching modes bring nothing here; keep the classic request-time render.
  reactStrictMode: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
