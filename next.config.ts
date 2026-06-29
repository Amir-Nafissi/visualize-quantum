import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project so Next doesn't pick up a stray
  // lockfile in a parent directory.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
