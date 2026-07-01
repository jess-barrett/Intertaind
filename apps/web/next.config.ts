import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@intertaind/types", "@intertaind/media"],
};

export default nextConfig;
