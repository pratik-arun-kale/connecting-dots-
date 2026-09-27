import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json under the user's home directory made Turbopack
  // misdetect the workspace root two levels up, watching the whole home
  // folder instead of just this project — pin it explicitly.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
