import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle with only the traced runtime
  // dependencies. Required by the Docker image (see Dockerfile): it lets the
  // runtime stage ship without node_modules or a package manager.
  output: "standalone",

  // Cache Components (PPR). Gives us `use cache` + cacheLife/cacheTag for the
  // catalog, and streams uncached price/stock at request time behind Suspense.
  // This is what lets a PDP have a static-fast shell that can never serve a
  // stale price. See docs/architecture.md §5.
  cacheComponents: true,

  images: {
    // Explicit dimensions are required on every product image (the API models
    // them as required) so PLP/PDP do not pay CLS for late-loading art.
    remotePatterns: [{ protocol: "https", hostname: "cdn.test" }],
  },
};

export default nextConfig;
