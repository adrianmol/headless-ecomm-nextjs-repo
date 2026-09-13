import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { serverEnv } from "@/lib/env";

/**
 * robots.txt.
 *
 * Disallows the routes that are either per-visitor or operational, and would
 * otherwise waste crawl budget on pages that cannot rank:
 *
 *  - `/cos`, `/finalizare-comanda`, `/comenzi` are per-visitor. They also carry
 *    an order reference in the path, and a crawled order URL is an order
 *    reference sitting in someone else's index.
 *  - `/api` and `/health` are machine endpoints.
 *
 * This is **not** an access control. Anything genuinely private must be
 * protected server-side; robots.txt is a request to well-behaved crawlers and is
 * itself publicly readable, so listing a path here advertises it. Everything
 * disallowed below is already either session-scoped or harmless to know about.
 *
 * The `sitemap` line needs an absolute URL, so it appears only once
 * `STOREFRONT_URL` is configured. Omitting a line is better than emitting one
 * pointing at a placeholder domain, which would send crawlers somewhere that is
 * not this shop.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  // Same reason as the sitemap: prerendering this would bake in the build-time
  // STOREFRONT_URL, and `build:ci` defaults that to http://localhost:3000 — so a
  // production image would advertise `Sitemap: http://localhost:3000/sitemap.xml`.
  await connection();

  const origin = serverEnv().STOREFRONT_URL;

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/health",
        "/cos",
        "/finalizare-comanda",
        "/comenzi/",
      ],
    },
    ...(origin ? { sitemap: new URL("/sitemap.xml", origin).toString() } : {}),
  };
}
