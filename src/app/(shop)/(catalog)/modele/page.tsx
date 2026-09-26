import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getHubCategories } from "@/commerce/hub/queries";
import type { HubCategory } from "@/commerce/hub/schemas";
import { hubCategorySlug } from "@/lib/hub-slug";
import { Reveal } from "@/components/reveal";

/**
 * Browse the HUB catalogue by equipment.
 *
 * ## Why this route exists at all
 *
 * HUB has no "list all products" endpoint — products are reachable only through a
 * category. So the catalogue's entry point cannot be a product list; it has to be a
 * list of categories. In practice those categories are printer models, which suits a
 * consumables shop: "which machine do you have" is the question, and this is the
 * answer as a browsable index.
 *
 * ## Why it does not replace /produse
 *
 * `/produse` is backed by the provisional contract and works — facets, sorting and
 * cursor pagination, all covered by E2E that CI can actually run. Replacing it with a
 * route CI cannot test (there are no HUB credentials in CI) would trade tested
 * behaviour for untested behaviour. Both exist until the migration finishes.
 *
 * ## What cannot be migrated, measured rather than assumed
 *
 *  - `/categorii/{slug}`, the six product-type categories: HUB exposes product type
 *    on the *product* (`type`: toner, chip, opc…) and offers no endpoint that lists
 *    products by it. There is nothing to query.
 *  - `/compatibil/{brand}`: only 11 of 20 brand roots hold any products at all, and
 *    those hold between 1 and 20 — Brother, Dell, Xerox and six others hold none,
 *    because the tree's intermediate nodes are unpublished. A brand page would be
 *    empty for half the brands in the shop.
 *  - `/cos`, checkout and orders: HUB has no cart, checkout or order endpoints.
 *
 * ## Sorting
 *
 * By product count, descending. A fact from the API rather than a merchandising
 * decision, and the most useful default: a model with 131 consumables is a more
 * rewarding place to land than one with a single chip. Alphabetical would put "1100"
 * first for no reason.
 */

const PER_PAGE = 60;

export const metadata: Metadata = {
  title: "Echipamente si consumabile compatibile",
  description:
    "Alege echipamentul si vezi consumabilele compatibile disponibile: tonere, cartuse, cilindri si piese.",
  alternates: { canonical: "/modele" },
};

/**
 * Reads `?pagina=`, and rejects rather than clamps a malformed value.
 *
 * A page number is not an opaque token, so an out-of-range one is a bad link. It
 * falls back to page 1 instead of erroring, because unlike a stale cursor there is
 * nothing to lose: page 1 is a perfectly good answer to "show me the catalogue".
 */
function pageFrom(raw: string | string[] | undefined): number {
  if (typeof raw !== "string") return 1;
  const page = Number(raw);
  if (!Number.isSafeInteger(page) || page < 1) return 1;
  return page;
}

function KindLabel({ kind }: { kind: HubCategory["kind"] }) {
  // HUB's own taxonomy, not ours: `prn` is a printer model, `family` a consumable
  // family. Labelled rather than shown raw, since neither word means anything to a
  // shopper.
  const label =
    kind === "prn" ? "Echipament" : kind === "family" ? "Familie" : "Categorie";
  return (
    <span className="bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase">
      {label}
    </span>
  );
}

async function ModelIndex({
  searchParams,
}: {
  searchParams: PageProps<"/modele">["searchParams"];
}) {
  // Every HUB request is signed with a timestamp, so it reads the clock and cannot
  // be prerendered. See queries.ts.
  await connection();

  const params = await searchParams;
  const page = pageFrom(params.pagina);

  let categories;
  try {
    categories = await getHubCategories({ withCounts: true });
  } catch {
    return (
      <p className="text-muted-foreground">
        Catalogul nu este disponibil momentan. Incearca din nou in cateva
        minute.
      </p>
    );
  }

  /*
    `productCount` is null unless counting was requested, and the contract is explicit
    that absent is not zero — so this filters on a real number. Filtering on a truthy
    value would silently drop everything if `count=1` ever stopped being sent.
  */
  const populated = categories
    .filter((c) => typeof c.productCount === "number" && c.productCount > 0)
    .sort((a, b) => (b.productCount ?? 0) - (a.productCount ?? 0));

  const pages = Math.max(1, Math.ceil(populated.length / PER_PAGE));
  const current = Math.min(page, pages);
  const slice = populated.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  return (
    <>
      <p className="text-muted-foreground mb-6 text-sm">
        {populated.length} echipamente si familii cu consumabile disponibile
        {pages > 1 && ` · pagina ${current} din ${pages}`}
      </p>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {slice.map((category) => (
          <li key={category.id}>
            <Link
              href={`/categorii-hub/${hubCategorySlug(category)}`}
              className="border-border bg-card hover:border-foreground/30 focus-visible:ring-ring flex h-full items-start justify-between gap-3 rounded-lg border p-4 focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  {category.name}
                </span>
                <span className="text-muted-foreground mt-1 block text-xs">
                  {category.productCount}{" "}
                  {category.productCount === 1 ? "consumabil" : "consumabile"}
                </span>
              </span>
              <KindLabel kind={category.kind} />
            </Link>
          </li>
        ))}
      </ul>

      {pages > 1 && (
        <nav
          aria-label="Paginare"
          className="mt-8 flex items-center justify-between gap-4"
        >
          {current > 1 ? (
            <Link
              href={current === 2 ? "/modele" : `/modele?pagina=${current - 1}`}
              className="border-border hover:bg-muted focus-visible:ring-ring rounded-md border px-4 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              ← Pagina anterioara
            </Link>
          ) : (
            <span />
          )}
          {current < pages && (
            <Link
              href={`/modele?pagina=${current + 1}`}
              className="border-border hover:bg-muted focus-visible:ring-ring rounded-md border px-4 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              Pagina urmatoare →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

function ModelIndexSkeleton() {
  return (
    <div aria-hidden>
      <div className="bg-muted mb-6 h-4 w-64 animate-pulse rounded" />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }, (_, i) => (
          <li key={i}>
            <div className="border-border bg-card h-[74px] animate-pulse rounded-lg border" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ModelIndexPage({ searchParams }: PageProps<"/modele">) {
  return (
    <main className="max-w-page mx-auto px-4 py-10">
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
        Alege echipamentul
      </h1>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
        Consumabilele sunt organizate pe echipamente. Alege modelul si vezi ce
        tonere, cartuse si piese se potrivesc.
      </p>

      <div className="mt-8">
        <Reveal fallback={<ModelIndexSkeleton />}>
          <ModelIndex searchParams={searchParams} />
        </Reveal>
      </div>
    </main>
  );
}
