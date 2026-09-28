import type { MetadataRoute } from "next";
import { connection } from "next/server";
import {
  listPrinterBrands,
  listPrinterModels,
  listProducts,
} from "@/commerce/catalog/queries";
import { getHubCategories } from "@/commerce/hub/queries";
import { CATEGORIES } from "@/lib/catalog-taxonomy";
import { serverEnv } from "@/lib/env";
import { hubCategorySlug } from "@/lib/hub-slug";

/**
 * sitemap.xml.
 *
 * Lists only canonical, indexable, crawlable-by-a-stranger URLs: the landing
 * page, the catalogue, the category pages, the printer compatibility pages and
 * the products. Basket, checkout and order pages are absent for the same reason
 * robots.txt disallows them — they are per-visitor, and an order URL in a sitemap
 * is an order reference published to the world.
 *
 * Paginated listing URLs (`?cursor=…`) are excluded deliberately. A cursor is an
 * opaque backend token whose validity is not guaranteed to outlive a catalogue
 * change, so a sitemap full of them would decay into soft-404s, and the pages
 * they address hold nothing that the product URLs do not.
 *
 * ## Why the compatibility pages matter here
 *
 * "toner for HL-2130" is how this catalogue is actually searched, so
 * `/compatibil/{brand}/{model}` is the long tail worth indexing. That costs one
 * request per brand to enumerate models, which is acceptable for a response
 * cached in days and regenerated rarely — but it is an N+1 by construction, so it
 * is bounded below rather than left to grow quietly.
 */

/**
 * Google's limit is 50,000 URLs per sitemap file. Staying well under it keeps
 * this a single file; crossing it needs a sitemap index, which is a different
 * shape rather than a bigger number. Whichever limit binds first, the build
 * should not silently emit an oversized document.
 */
const MAX_URLS = 45_000;

/** Guards the per-brand model requests from becoming unbounded. */
const MAX_BRANDS_FOR_MODELS = 100;

/** Pages of products to walk. `limit` is the API's maximum page size. */
const PRODUCT_PAGE_SIZE = 100;
const MAX_PRODUCT_PAGES = 50;

async function allProductSlugs(): Promise<string[]> {
  const slugs: string[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PRODUCT_PAGES; page++) {
    const result = await listProducts({ limit: PRODUCT_PAGE_SIZE, cursor });
    for (const product of result.items) slugs.push(product.slug);

    // The contract's own pagination signal. Trusting a page-count calculation
    // instead would break the moment the catalogue changed size mid-walk.
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }

  return slugs;
}

/**
 * The HUB collections: every printer and cartridge family that holds products.
 * The plan names exactly these as indexable (stage 3.2).
 *
 * **HUB products are not listed**, and cannot be: they are reachable only
 * through a category, so there is nothing to enumerate them with
 * (docs/hub-api-gaps.md §2). They are still found by crawling these pages.
 *
 * Empty rather than failing when HUB cannot be read — a sitemap missing a
 * section is a smaller fault than no sitemap.
 */
async function hubCollectionPaths(): Promise<string[]> {
  try {
    const categories = await getHubCategories({ withCounts: true });
    return (
      categories
        // A real count, not a truthy one: absent means "not counted".
        .filter(
          (c) =>
            c.kind !== "brand" &&
            typeof c.productCount === "number" &&
            c.productCount > 0,
        )
        .map((c) => `/categorii-hub/${hubCategorySlug(c)}`)
    );
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  /*
    Rendered at request time, and this is not a preference.

    A sitemap route is prerendered by default, which means it captures whatever
    STOREFRONT_URL held *at build time*. That is the wrong moment: runtime config
    for this project lives in app.env on the host, so a value supplied there would
    never reach an already-prerendered document. Worse, `build:ci` — the script
    used for the `-mockapi` images — defaults STOREFRONT_URL to
    `http://localhost:3000`, so a prerendered sitemap ships a document telling
    crawlers this shop lives on localhost. Verified by building and serving it:
    every <loc> read http://localhost:3000 despite a different origin being set at
    runtime.

    The catalog reads below are still `use cache`, so the expensive part is shared
    rather than repeated per request. Only the origin and the string assembly are
    request-time.
  */
  await connection();

  const origin = serverEnv().STOREFRONT_URL;
  if (!origin) {
    /*
      Every entry needs an absolute URL, and there is no request context here to
      infer one from. Rather than guess a domain — which would publish a sitemap
      of URLs belonging to somewhere else — this degrades to empty.

      In practice this only happens locally and in CI: production cannot run
      without STOREFRONT_URL, because product metadata already refuses to render
      without it.
    */
    console.warn(
      JSON.stringify({
        event: "sitemap_skipped",
        reason: "STOREFRONT_URL not configured",
      }),
    );
    return [];
  }

  const url = (path: string) => new URL(path, origin).toString();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: url("/"), changeFrequency: "daily", priority: 1 },
    { url: url("/produse"), changeFrequency: "daily", priority: 0.9 },
    { url: url("/compatibil"), changeFrequency: "weekly", priority: 0.8 },
    { url: url("/modele"), changeFrequency: "weekly", priority: 0.8 },
    { url: url("/info/seap"), changeFrequency: "yearly", priority: 0.3 },
  ];

  const categoryEntries: MetadataRoute.Sitemap = CATEGORIES.map((category) => ({
    url: url(`/categorii/${category.slug}`),
    changeFrequency: "daily",
    priority: 0.8,
  }));

  const brands = await listPrinterBrands();
  const brandEntries: MetadataRoute.Sitemap = brands.map((brand) => ({
    url: url(`/compatibil/${brand.slug}`),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const modelEntries: MetadataRoute.Sitemap = [];
  for (const brand of brands.slice(0, MAX_BRANDS_FOR_MODELS)) {
    const models = await listPrinterModels(brand.slug);
    for (const model of models) {
      modelEntries.push({
        url: url(`/compatibil/${brand.slug}/${model.slug}`),
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  }

  const productEntries: MetadataRoute.Sitemap = (await allProductSlugs()).map(
    (slug) => ({
      url: url(`/produse/${slug}`),
      changeFrequency: "daily",
      priority: 0.7,
    }),
  );

  const hubEntries: MetadataRoute.Sitemap = (await hubCollectionPaths()).map(
    (path) => ({ url: url(path), changeFrequency: "weekly", priority: 0.6 }),
  );

  /*
    No `lastModified` anywhere. The catalog contract exposes no per-resource
    modification timestamp, and the alternatives are worse than omitting it: a
    build time would claim every page changed on every deploy, and `new Date()`
    would be both a lie and a request-time read inside a cached scope. An absent
    lastModified is a crawler hint declined; a wrong one is a hint that trains
    the crawler to ignore the file.
  */
  return [
    ...staticEntries,
    ...categoryEntries,
    ...brandEntries,
    ...modelEntries,
    ...productEntries,
    // Last, so that if the cap ever binds it is the longest tail that is cut.
    ...hubEntries,
  ].slice(0, MAX_URLS);
}
