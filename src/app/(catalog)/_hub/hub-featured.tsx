import Link from "next/link";
import { connection } from "next/server";
import { getHubCategories, getHubCategoryPage } from "@/commerce/hub/queries";
import { hubCategorySlug } from "@/lib/hub-slug";
import { HubProductGrid } from "./hub-product-grid";

/**
 * The homepage product band, sourced from the HUB catalogue.
 *
 * ## Which products, and why
 *
 * HUB has no "list all products" endpoint — products are only reachable through a
 * category — so a band has to choose one. The rule here is the best-covered printer
 * model: of the 11,991 categories, the one with the most consumables.
 *
 * That is a fact the API supplies rather than a merchandising decision. One request
 * with `count=1` returns direct product counts for the whole tree, so picking the
 * maximum costs nothing extra and is reproducible. It is not a claim about
 * popularity, margin or promotion — none of which HUB exposes — and the heading says
 * exactly what it is, so no shopper is told these are "featured" or "best selling"
 * when nothing in the data supports either word.
 *
 * ## Why it degrades to nothing
 *
 * Same reason as every other band on that page: an unreachable catalogue must cost
 * the landing page its least important section, not the whole render.
 */
export async function HubFeaturedBand({ count = 4 }: { count?: number }) {
  /*
    Request-time, and not by choice: every HUB request carries an
    `X-Timestamp` and an HMAC over it, so signing reads the clock — which is
    precisely the "uncached or runtime data" that prerendering rejects. The build
    fails outright otherwise, which is the correct outcome: a prerendered HUB
    response would have been signed at build time and its 5-minute window would
    have expired long before anyone saw the page.

    The catalog reads inside are still `use cache`, so this shifts *when* the work
    happens rather than how often.
  */
  await connection();

  let categories;
  try {
    categories = await getHubCategories({ withCounts: true });
  } catch {
    return null;
  }

  /*
    `productCount` is null unless counting was requested, and the contract is
    explicit that absent is not zero — so the filter is for a real number rather
    than a truthy one, or every uncounted category would sort as if empty.
  */
  const best = categories
    .filter((c) => typeof c.productCount === "number" && c.productCount > 0)
    .sort((a, b) => (b.productCount ?? 0) - (a.productCount ?? 0))[0];

  if (!best) return null;

  let page;
  try {
    page = await getHubCategoryPage(best.id, { perPage: count, sort: "price" });
  } catch {
    return null;
  }

  if (page.products.length === 0) return null;

  const href = `/categorii-hub/${hubCategorySlug(best)}`;

  return (
    <>
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-bold tracking-tight">
          Consumabile pentru {page.category.name}
        </h2>
        <Link
          href={href}
          className="text-primary focus-visible:ring-ring shrink-0 rounded text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          Vezi toate cele {page.pagination.total} →
        </Link>
      </div>
      <HubProductGrid products={page.products} />
    </>
  );
}
