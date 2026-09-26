import type { Metadata } from "next";
import Link from "next/link";
import { listPrinterBrands } from "@/commerce/catalog/queries";
import { PrinterFinder } from "@/components/commerce/printer-finder";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = {
  title: "Cauta dupa imprimanta",
  description:
    "Alege marca si modelul imprimantei tale si vezi consumabilele compatibile.",
  alternates: { canonical: "/compatibil" },
};

/**
 * The finder's landing page: choose a printer brand, then a model.
 *
 * Fully static. It reads no `searchParams` — the form submits to
 * `/api/compatibil`, which redirects to the canonical path-based URL. Handling
 * that here instead would make this page runtime-rendered and cost it the
 * static shell, for no benefit.
 */
async function Finder() {
  const brands = await listPrinterBrands();

  return (
    <PrinterFinder
      brands={brands.map((brand) => ({ slug: brand.slug, name: brand.name }))}
    />
  );
}

/** Must reserve the finder's exact box, or the swap shifts the page. */
function FinderSkeleton() {
  return (
    <div
      className="border-border bg-card h-19 animate-pulse rounded-lg border sm:h-22"
      aria-hidden
    />
  );
}

export default function CompatibilityEntryPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Cauta dupa imprimanta</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Alege marca imprimantei, apoi modelul, si vei vedea doar consumabilele
        care se potrivesc.
      </p>

      <div className="mt-6">
        <Reveal fallback={<FinderSkeleton />}>
          <Finder />
        </Reveal>
      </div>

      <p className="text-muted-foreground mt-6 text-sm">
        Nu stii modelul?{" "}
        <Link
          href="/produse"
          className="text-primary focus-visible:ring-ring rounded underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
        >
          Rasfoieste tot catalogul
        </Link>
        .
      </p>
    </main>
  );
}
