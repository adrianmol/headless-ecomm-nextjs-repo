import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  listPrinterBrands,
  listPrinterModels,
} from "@/commerce/catalog/queries";
import {
  ProductListing,
  ProductListingSkeleton,
} from "../../../_listing/product-listing";
import { parseCatalogQuery } from "@/lib/catalog-url";

/**
 * Consumables that fit one specific printer — the page the whole shop exists to
 * deliver. A shopper who arrives here has answered "what do I own", and every
 * product listed is guaranteed compatible, so no further qualification is
 * needed before adding to the basket.
 *
 * `params` is passed down rather than awaited in the page body, so the route
 * still prerenders. See the sibling `[brand]` page.
 */

async function resolve(brandSlug: string, modelSlug: string) {
  const [brands, models] = await Promise.all([
    listPrinterBrands(),
    listPrinterModels(brandSlug),
  ]);
  const brand = brands.find((b) => b.slug === brandSlug);
  const model = models.find((m) => m.slug === modelSlug);
  return { brand, model };
}

export async function generateMetadata({
  params,
}: PageProps<"/compatibil/[brand]/[model]">): Promise<Metadata> {
  const { brand: brandSlug, model: modelSlug } = await params;
  const { brand, model } = await resolve(brandSlug, modelSlug);
  if (!brand || !model) return {};

  const name = `${brand.name} ${model.name}`;
  return {
    title: `Consumabile pentru ${name}`,
    description: `Tonere, cartuse si piese compatibile cu imprimanta ${name}. Randament, coduri echivalente si stoc in timp real.`,
    alternates: { canonical: `/compatibil/${brand.slug}/${model.slug}` },
  };
}

type Params = PageProps<"/compatibil/[brand]/[model]">["params"];
type SearchParams = PageProps<"/compatibil/[brand]/[model]">["searchParams"];

async function ModelHeader({ params }: { params: Params }) {
  const { brand: brandSlug, model: modelSlug } = await params;
  const { brand, model } = await resolve(brandSlug, modelSlug);
  if (!brand || !model) notFound();

  return (
    <>
      <nav aria-label="Navigare" className="text-muted-foreground text-sm">
        <Link
          href={`/compatibil/${brand.slug}`}
          className="focus-visible:ring-ring rounded hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          {brand.name}
        </Link>
      </nav>

      <h1 className="mt-1 text-2xl font-semibold">
        Consumabile pentru {brand.name} {model.name}
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Toate produsele de mai jos sunt compatibile cu acest model.
      </p>
    </>
  );
}

function ModelHeaderSkeleton() {
  return (
    <div aria-hidden>
      <div className="bg-muted h-5 w-24 animate-pulse rounded" />
      <div className="bg-muted mt-1 h-8 w-96 max-w-full animate-pulse rounded" />
      <div className="bg-muted mt-2 h-5 w-80 max-w-full animate-pulse rounded" />
    </div>
  );
}

async function Listing({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { brand: brandSlug, model: modelSlug } = await params;
  const parsed = parseCatalogQuery(await searchParams);
  const query = parsed.ok ? parsed.query : {};

  return (
    <ProductListing
      basePath={`/compatibil/${brandSlug}/${modelSlug}`}
      query={{ ...query, brand: brandSlug, model: modelSlug }}
      // Both are expressed by the route, so neither is offered as a facet.
      lockedKeys={["brand", "model"]}
      emptyMessage="Nu avem momentan consumabile pentru acest model."
    />
  );
}

export default function ModelPage({
  params,
  searchParams,
}: PageProps<"/compatibil/[brand]/[model]">) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Suspense fallback={<ModelHeaderSkeleton />}>
        <ModelHeader params={params} />
      </Suspense>

      <div className="mt-8">
        <Suspense fallback={<ProductListingSkeleton />}>
          <Listing params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
