import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getHubCategoryPage } from "@/commerce/hub/queries";
import { hubCategoryIdFromSlug, hubCategorySlug } from "@/lib/hub-slug";
import {
  HubEmptyCategory,
  HubProductGrid,
  HubProductGridSkeleton,
} from "../../_hub/hub-product-grid";

/**
 * A HUB catalogue category — in practice a printer model — and its consumables.
 *
 * ## Why this route exists alongside /categorii
 *
 * `/categorii/{slug}` is the storefront's own six product-type categories, backed
 * by the provisional contract's `kind` filter. This is a different axis entirely:
 * HUB's categories are a compatibility taxonomy, brand → family → printer model, so
 * a `prn` node answers "what fits this printer?". Both are legitimate and not
 * interchangeable, so they get separate namespaces rather than one route that has to
 * guess which kind of id it was handed.
 *
 * ## Why one component does the whole page
 *
 * Heading, count and grid all come from a single `getHubCategoryPage` call. Splitting
 * the heading into its own component would mean a second call — `use cache` would
 * probably collapse them, but that is a caching detail to lean on rather than a
 * guarantee, and the page has nothing to show before the fetch resolves anyway.
 *
 * ## Why `deep` is not used
 *
 * A model category has no children, so there is nothing to aggregate. On nodes that
 * do have children `deep` is unusable — over 25 seconds for a 1,277-child subtree,
 * measured in queries.ts — so asking for it would turn a fast page into a timeout
 * for no gain.
 *
 * ## Pagination
 *
 * Not here yet, and deliberately: `per_page` caps at 100 and the best-populated
 * model observed holds 131, so one request covers all but a handful of categories.
 * The total is shown so a truncated page says so rather than pretending to be
 * complete. `page`/`per_page` are both verified working when it is worth adding.
 */

const PER_PAGE = 100;

/**
 * Canonical URL, and the reason it is a `<link>` rather than a redirect.
 *
 * The id is what resolves, so a renamed category keeps working on its old URL —
 * good for visitors, bad for crawlers, because one page then has several indexable
 * URLs. The obvious fix is `permanentRedirect`, and it was the first attempt: it
 * does nothing. By the time the category name is known the fetch has resolved
 * inside a `<Suspense>` boundary, the response has already begun with a 200, and a
 * redirect can no longer be issued. Verified against the built server — a
 * non-canonical URL returned 200 with no Location header.
 *
 * `generateMetadata` runs *before* the body streams, so this is where the decision
 * still belongs. It costs no extra upstream request: the arguments match the page's
 * own call, so `use cache` serves both from one entry.
 */
export async function generateMetadata({
  params,
}: PageProps<"/categorii-hub/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const id = hubCategoryIdFromSlug(slug);
  if (id === null) return {};

  try {
    const page = await getHubCategoryPage(id, {
      perPage: PER_PAGE,
      sort: "price",
    });
    /*
      `notFound()` rather than empty metadata. Returning `{}` suppressed the
      not-found page's `noindex` — measured, an unknown category served 200 with no
      robots directive at all, which is a soft 404 a crawler will index. Aborting
      metadata generation lets the not-found segment supply its own, which is what
      the existing PDP does for the same reason.
    */
    if (!page) notFound();

    return {
      title: page.category.name,
      alternates: {
        canonical: `/categorii-hub/${hubCategorySlug(page.category)}`,
      },
    };
  } catch {
    // A transient fault; the body handles it and the page still renders rather
    // than 404ing on a network blip.
    return {};
  }
}

async function CategoryView({
  params,
}: {
  params: PageProps<"/categorii-hub/[slug]">["params"];
}) {
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

  /*
    `params` is awaited here rather than in the page component, and that is
    load-bearing: awaiting it outside a <Suspense> boundary blocks the whole route
    from prerendering, which the build rejects. The same pattern as the listing
    route — pass the promise down, resolve it inside the boundary.
  */
  const { slug } = await params;
  const id = hubCategoryIdFromSlug(slug);

  // A URL with no recoverable id is a bad link, not a fault.
  if (id === null) notFound();

  // A missing category is an ordinary outcome — a stale link, an id that no longer
  // exists — so it belongs in the 404 surface rather than the error boundary. Any
  // other failure still propagates.
  const page = await getHubCategoryPage(id, {
    perPage: PER_PAGE,
    sort: "price",
  });
  if (!page) notFound();

  const { total } = page.pagination;
  const shown = page.products.length;

  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
        {page.category.name}
      </h1>

      {shown === 0 ? (
        <div className="mt-5">
          <HubEmptyCategory href="/produse" />
        </div>
      ) : (
        <>
          <p className="text-muted-foreground mt-2 mb-6 text-sm">
            {total} {total === 1 ? "consumabil" : "consumabile"}
            {total > shown && ` · se afiseaza primele ${shown}`}
          </p>
          <HubProductGrid products={page.products} />
        </>
      )}
    </>
  );
}

export default function HubCategoryPage({
  params,
}: PageProps<"/categorii-hub/[slug]">) {
  return (
    <main className="max-w-page mx-auto px-4 py-10">
      <Suspense
        fallback={
          <>
            <div className="bg-muted h-9 w-72 animate-pulse rounded" />
            <div className="bg-muted mt-2 mb-6 h-4 w-40 animate-pulse rounded" />
            <HubProductGridSkeleton count={8} />
          </>
        }
      >
        <CategoryView params={params} />
      </Suspense>

      <p className="mt-10 text-sm">
        <Link
          href="/produse"
          className="text-primary focus-visible:ring-ring rounded hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          ← Vezi tot catalogul
        </Link>
      </p>
    </main>
  );
}
