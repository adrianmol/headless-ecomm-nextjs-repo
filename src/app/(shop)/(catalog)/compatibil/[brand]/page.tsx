import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  listPrinterBrands,
  listPrinterModels,
} from "@/commerce/catalog/queries";
import {
  ProductListing,
  ProductListingSkeleton,
} from "../../_listing/product-listing";
import { PrinterFinder } from "@/components/commerce/printer-finder";
import { parseCatalogQuery } from "@/lib/catalog-url";
import { Reveal } from "@/components/reveal";

/**
 * All consumables for one printer brand, plus the finder pre-filled with that
 * brand so the model dropdown is now populated server-side. This is the second
 * step of the two-step finder described in `printer-finder.tsx`.
 *
 * Like the PDP, `params` is never awaited in the page body: on a dynamic route
 * that is a runtime data access outside every Suspense boundary, and it stops
 * the whole route from prerendering. The promise is passed down instead, and
 * each boundary resolves it independently.
 */

async function findBrand(slug: string) {
  const brands = await listPrinterBrands();
  return brands.find((brand) => brand.slug === slug);
}

export async function generateMetadata({
  params,
}: PageProps<"/compatibil/[brand]">): Promise<Metadata> {
  const { brand: brandSlug } = await params;
  const brand = await findBrand(brandSlug);
  if (!brand) return {};

  return {
    title: `Consumabile pentru imprimante ${brand.name}`,
    description: `Tonere, cartuse si piese compatibile pentru imprimantele ${brand.name}.`,
    alternates: { canonical: `/compatibil/${brand.slug}` },
  };
}

type Params = PageProps<"/compatibil/[brand]">["params"];
type SearchParams = PageProps<"/compatibil/[brand]">["searchParams"];

async function BrandHeader({ params }: { params: Params }) {
  const { brand: brandSlug } = await params;
  const brand = await findBrand(brandSlug);
  // An unknown brand is a real 404 rather than an empty listing: the slug comes
  // from a URL, and rendering "0 produse" for a typo hides the mistake.
  if (!brand) notFound();

  return (
    <>
      <h1 className="text-2xl font-semibold">
        Consumabile pentru imprimante {brand.name}
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Alege modelul pentru a vedea doar consumabilele care se potrivesc.
      </p>
    </>
  );
}

function BrandHeaderSkeleton() {
  return (
    <div aria-hidden>
      <div className="bg-muted h-8 w-96 max-w-full animate-pulse rounded" />
      <div className="bg-muted mt-2 h-5 w-80 max-w-full animate-pulse rounded" />
    </div>
  );
}

async function BrandFinder({ params }: { params: Params }) {
  const { brand: brandSlug } = await params;

  // Both lists are `use cache` scopes with a long TTL, so this pair of reads
  // is effectively free after the first request for the brand.
  const [brands, models] = await Promise.all([
    listPrinterBrands(),
    listPrinterModels(brandSlug),
  ]);

  return (
    <PrinterFinder
      brands={brands.map((b) => ({ slug: b.slug, name: b.name }))}
      models={models.map((m) => ({ slug: m.slug, name: m.name }))}
      selectedBrand={brandSlug}
    />
  );
}

function FinderSkeleton() {
  return (
    <div
      className="border-border bg-card h-19 animate-pulse rounded-lg border sm:h-22"
      aria-hidden
    />
  );
}

async function Listing({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { brand: brandSlug } = await params;
  const parsed = parseCatalogQuery(await searchParams);
  const query = parsed.ok ? parsed.query : {};

  return (
    <ProductListing
      basePath={`/compatibil/${brandSlug}`}
      // The route's brand is authoritative, as on category pages.
      query={{ ...query, brand: brandSlug }}
      lockedKeys={["brand"]}
      emptyMessage="Nu avem momentan consumabile pentru aceasta marca."
    />
  );
}

export default function BrandPage({
  params,
  searchParams,
}: PageProps<"/compatibil/[brand]">) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Reveal fallback={<BrandHeaderSkeleton />}>
        <BrandHeader params={params} />
      </Reveal>

      <div className="mt-5 max-w-3xl">
        <Reveal fallback={<FinderSkeleton />}>
          <BrandFinder params={params} />
        </Reveal>
      </div>

      <div className="mt-8">
        <Reveal fallback={<ProductListingSkeleton />}>
          <Listing params={params} searchParams={searchParams} />
        </Reveal>
      </div>
    </main>
  );
}
