import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ProductListing,
  ProductListingSkeleton,
} from "../../_listing/product-listing";
import { parseCatalogQuery } from "@/lib/catalog-url";
import { CATEGORIES, categoryBySlug } from "@/lib/catalog-taxonomy";
import { Reveal } from "@/components/reveal";

/**
 * Category landing pages, one per consumable kind.
 *
 * The kind comes from the route, not from a query parameter, so these are
 * stable indexable URLs rather than a filtered view of `/produse`. The kind
 * facet is then hidden from the panel: offering to un-tick the category you are
 * standing on would link to a page that contradicts its own heading.
 */

/**
 * The category set is a fixed, storefront-owned list, so every page is known at
 * build time and prerenders. No `dynamicParams` concerns: an unknown slug is a
 * genuine 404, not a category we have yet to hear about.
 */
export function generateStaticParams() {
  return CATEGORIES.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/categorii/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const category = categoryBySlug(slug);
  if (!category) return {};

  return {
    title: category.name,
    description: category.description,
    alternates: { canonical: `/categorii/${category.slug}` },
  };
}

type SearchParams = PageProps<"/categorii/[slug]">["searchParams"];

async function Listing({
  slug,
  searchParams,
}: {
  slug: string;
  searchParams: SearchParams;
}) {
  const category = categoryBySlug(slug);
  if (!category) notFound();

  const parsed = parseCatalogQuery(await searchParams);
  const query = parsed.ok ? parsed.query : {};

  return (
    <ProductListing
      basePath={`/categorii/${category.slug}`}
      // The route's kind wins over anything in the query string: this page is
      // defined by its category and must not be filterable into a different one.
      query={{ ...query, kind: category.kind }}
      lockedKeys={["kind"]}
      emptyMessage={`Nu avem momentan produse in categoria ${category.name}.`}
    />
  );
}

export default async function CategoryPage({
  params,
  searchParams,
}: PageProps<"/categorii/[slug]">) {
  const { slug } = await params;
  const category = categoryBySlug(slug);
  if (!category) notFound();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">{category.name}</h1>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
        {category.description}
      </p>

      <div className="mt-6">
        <Reveal fallback={<ProductListingSkeleton />}>
          <Listing slug={slug} searchParams={searchParams} />
        </Reveal>
      </div>
    </main>
  );
}
