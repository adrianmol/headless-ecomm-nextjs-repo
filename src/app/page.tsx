import { Suspense } from "react";
import Link from "next/link";
import { listPrinterBrands } from "@/commerce/catalog/queries";
import { PrinterFinder } from "@/components/commerce/printer-finder";
import { CATEGORIES } from "@/lib/catalog-taxonomy";

/**
 * Homepage.
 *
 * Built around one question — "which printer do you have?" — because that is
 * how this catalog is actually navigated. A consumables shop is not browsed
 * like a clothing store: nobody wants to see twenty cartridges, they want the
 * one that fits. So the finder is the hero, not a carousel.
 *
 * Copy states only what this storefront can support: that the catalogue is
 * browsable by printer and by category, and that price and stock are read live.
 * It makes no claim about delivery times, warranty length, provenance, or the
 * business's history. None of that exists in openapi/commerce.yaml, and for a
 * real shop, publishing claims that may be untrue is a legal problem, not a
 * copy problem. Marketing content is owner-supplied; read it from a CMS field
 * when one exists.
 */

async function Finder() {
  const brands = await listPrinterBrands();

  return (
    <PrinterFinder
      brands={brands.map((brand) => ({ slug: brand.slug, name: brand.name }))}
    />
  );
}

/** Must reserve the finder's exact box, or the swap shifts the hero. */
function FinderSkeleton() {
  return (
    <div
      className="border-border bg-card h-19 animate-pulse rounded-lg border sm:h-22"
      aria-hidden
    />
  );
}

async function BrandLinks() {
  const brands = await listPrinterBrands();

  return (
    <ul className="flex flex-wrap gap-2">
      {brands.map((brand) => (
        <li key={brand.slug}>
          <Link
            href={`/compatibil/${brand.slug}`}
            className="border-border bg-card hover:border-foreground/30 focus-visible:ring-ring inline-block rounded-md border px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            {brand.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function BrandLinksSkeleton() {
  return (
    <ul className="flex flex-wrap gap-2" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => (
        <li key={i}>
          <div className="bg-muted h-8.5 w-24 animate-pulse rounded-md" />
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
  return (
    <main>
      <section className="border-border bg-muted/40 border-b">
        <div className="mx-auto max-w-4xl px-4 py-12 text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Consumabile compatibile pentru imprimanta ta
          </h1>
          <p className="text-muted-foreground mx-auto mt-3 max-w-xl">
            Alege marca si modelul imprimantei si vezi exact ce se potriveste.
            Pretul si stocul sunt afisate in timp real.
          </p>

          <div className="mt-7 text-left">
            <Suspense fallback={<FinderSkeleton />}>
              <Finder />
            </Suspense>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-xl font-semibold">Categorii</h2>
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {CATEGORIES.map((category) => (
            <li key={category.slug}>
              <Link
                href={`/categorii/${category.slug}`}
                className="border-border bg-card hover:border-foreground/30 focus-visible:ring-ring flex h-full flex-col rounded-lg border p-3 focus-visible:ring-2 focus-visible:outline-none"
              >
                <span className="text-sm font-medium">{category.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-semibold">Marci de imprimante</h2>
          <Link
            href="/produse"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded text-sm underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
          >
            Vezi tot catalogul
          </Link>
        </div>
        <Suspense fallback={<BrandLinksSkeleton />}>
          <BrandLinks />
        </Suspense>
      </section>
    </main>
  );
}
