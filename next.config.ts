import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Content Security Policy.
 *
 * **On `script-src 'unsafe-inline'`, which is the uncomfortable part.** Next's
 * App Router streams RSC payloads as inline `<script>` blocks — 12 of them in
 * the prerendered `/` document, measured. Removing `'unsafe-inline'` breaks
 * hydration outright, and the only strict alternative is a per-request nonce.
 * A nonce cannot be baked into prerendered HTML, so adopting one forces every
 * HTML response to be rendered per request and destroys the static shell that
 * `cacheComponents` exists to provide. That trade is recorded as an open owner
 * decision in docs/next-steps.md rather than taken silently here.
 *
 * What this policy does buy, even with inline scripts allowed: no script may be
 * loaded from another origin, `eval` is unavailable in production, the document
 * cannot be framed, `<base>` cannot be rewritten, plugins are refused, and forms
 * cannot post off-origin. Those close real attack paths regardless.
 *
 * `'unsafe-eval'` is added **only** outside production, where React Refresh
 * needs it. It must never appear in a production response; the header test
 * asserts that.
 *
 * `img-src` stays tight because `next/image` proxies remote art through
 * `/_next/image` on this origin, so the CDN host does not need listing.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  // Next inlines critical CSS; Tailwind itself ships as an external stylesheet.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  // Geist is self-hosted by next/font, so no external font origin is needed.
  "font-src 'self'",
  // The Web Vitals beacon posts to /api/vitals on this origin.
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  // Server Actions post to this origin; the PSP hand-off is a server redirect,
  // not a cross-origin form submission.
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Legacy companion to frame-ancestors, for agents that predate CSP2.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here uses these APIs. `payment` is left alone deliberately: card
  // entry happens on the PSP's origin, not ours, so denying it buys nothing and
  // would need revisiting if that ever changes.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // Production only, and only meaningful once TLS terminates in front of this.
  // `preload` is deliberately omitted — submission to the preload list is
  // effectively irreversible and is the owner's call, not a default.
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  async redirects() {
    if (process.env.STOREFRONT_BACKEND !== "hub") return [];
    return [
      {
        source: "/produse/:slug",
        destination: "/produse-hub/:slug",
        permanent: false,
      },
      ...["/produse", "/categorii/:slug", "/compatibil/:path*"].map(
        (source) => ({ source, destination: "/modele", permanent: false }),
      ),
      {
        source: "/finalizare-comanda/confirming",
        destination: "/cos",
        permanent: false,
      },
      {
        source: "/finalizare-comanda/return",
        destination: "/cos",
        permanent: false,
      },
    ];
  },
  // Applied to every response, including static assets and Route Handlers.
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

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
    //
    // The allowlist is a security control, not configuration noise: without it
    // `next/image` would proxy and cache any URL a backend response named, which
    // turns the image optimiser into an open relay for arbitrary hosts.
    remotePatterns: [
      { protocol: "https", hostname: "cdn.test" },
      /*
        HUB serves product images from its own domain
        (https://hub.reprint.ro/media/imagine/produs/…). Added after every card in
        the HUB band rendered a broken image: the URLs were correct and the host
        was simply not permitted, which `next/image` reports only in the browser.
      */
      { protocol: "https", hostname: "hub.reprint.ro", pathname: "/media/**" },
    ],
  },
};

export default nextConfig;
