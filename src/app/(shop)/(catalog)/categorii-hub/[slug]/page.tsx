import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getHubCategories, getHubCategoryPage } from "@/commerce/hub/queries";
import type { HubCategory } from "@/commerce/hub/schemas";
import { printerName, resolveTaxonomy } from "@/commerce/hub/taxonomy";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { storefrontOrigin } from "@/lib/env";
import { groupByType } from "@/lib/hub-product-types";
import { hubCategoryIdFromSlug, hubCategorySlug } from "@/lib/hub-slug";
import {
  HubCollectionTable,
  HubCollectionTableSkeleton,
} from "../../_hub/hub-collection-table";
import { HubEmptyCategory } from "../../_hub/hub-product-grid";
import { Reveal } from "@/components/reveal";

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
 * ## The whole collection, not a page of it
 *
 * The products are grouped by type, and a group built from the first hundred of
 * 131 would be missing rows with nothing to say so. `per_page` caps at 100, so
 * the remaining pages are fetched as well, up to {@link MAX_PAGES}. The
 * best-populated model observed holds 131. Past the cap the total is shown, so
 * a truncated collection says so rather than pretending to be complete.
 */

const PER_PAGE = 100;
const MAX_PAGES = 3;

/**
 * "Lexmark CX510de" where the brand can be resolved, the bare model otherwise.
 * Three printers in four have no route to their brand; see taxonomy.ts.
 */
async function collectionName(category: HubCategory): Promise<string> {
  if (category.kind !== "prn") return category.name;
  try {
    const tree = await getHubCategories({ withCounts: true });
    const [printer] = resolveTaxonomy([category.id], tree).printers;
    return printer ? printerName(printer) : category.name;
  } catch {
    return category.name;
  }
}

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

  const { total, pages } = page.pagination;

  const [name, ...rest] = await Promise.all([
    collectionName(page.category),
    ...Array.from({ length: Math.min(pages, MAX_PAGES) - 1 }, (_, i) =>
      getHubCategoryPage(id, { perPage: PER_PAGE, sort: "price", page: i + 2 }),
    ),
  ]);
  const products = [page, ...rest].flatMap((p) => p?.products ?? []);
  const shown = products.length;

  const path = `/categorii-hub/${hubCategorySlug(page.category)}`;
  const origin = storefrontOrigin();
  // A printer's collection is "for" it; a family's is the family itself.
  const isPrinter = page.category.kind === "prn";

  return (
    <>
      <Breadcrumbs
        origin={origin}
        crumbs={[
          { name: "Acasă", href: "/" },
          { name: "Echipamente", href: "/modele" },
          { name, href: path },
        ]}
      />

      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
        {isPrinter ? `Consumabile pentru ${name}` : name}
      </h1>

      {shown === 0 ? (
        <div className="mt-5">
          <HubEmptyCategory href="/modele" />
        </div>
      ) : (
        <>
          <p className="text-muted-foreground mt-2 mb-6 text-sm">
            {total} {total === 1 ? "produs" : "produse"}
            {total > shown && ` · se afiseaza primele ${shown}`}
          </p>
          <HubCollectionTable
            groups={groupByType(products)}
            collection={name}
          />

          {origin && (
            <JsonLd
              data={{
                "@context": "https://schema.org",
                "@type": "ItemList",
                name: isPrinter ? `Consumabile pentru ${name}` : name,
                numberOfItems: shown,
                itemListElement: products.map((product, index) => ({
                  "@type": "ListItem",
                  position: index + 1,
                  name: product.name,
                  url: new URL(
                    `/produse-hub/${encodeURIComponent(product.slug || product.sku)}`,
                    origin,
                  ).toString(),
                })),
              }}
            />
          )}
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
      <Reveal
        fallback={
          <>
            <div className="bg-muted mb-6 h-5 w-64 animate-pulse rounded" />
            <div className="bg-muted h-9 w-96 max-w-full animate-pulse rounded" />
            <div className="bg-muted mt-2 mb-6 h-4 w-40 animate-pulse rounded" />
            <HubCollectionTableSkeleton />
          </>
        }
      >
        <CategoryView params={params} />
      </Reveal>

      <p className="mt-10 text-sm">
        <Link
          href="/modele"
          className="text-primary focus-visible:ring-ring rounded hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          ← Alege alt echipament
        </Link>
      </p>
    </main>
  );
}
