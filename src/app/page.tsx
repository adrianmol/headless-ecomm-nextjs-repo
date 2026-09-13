import { Suspense } from "react";
import Link from "next/link";
import { listPrinterBrands } from "@/commerce/catalog/queries";
import { PrinterFinder } from "@/components/commerce/printer-finder";
import {
  ProductGridSkeleton,
  ProductStrip,
} from "./(catalog)/_listing/product-listing";

/**
 * Homepage, following the owner's REPrint design file: a dark green hero, the
 * printer finder on a card breaking out of it, a row of guarantees, a band of
 * products, and the brand chips.
 *
 * The finder still carries the most weight, because it answers the only question
 * that matters in a consumables shop — "which one fits my printer?". Nobody wants
 * to see twenty cartridges; they want the one that works.
 *
 * ## Where this departs from the design, and why
 *
 * **Three product bands become one.** The design has "Produse HOT", "Promotii"
 * and "Cele mai cumparate produse". The contract has no promotion, popularity or
 * featured concept — grepped, not assumed — so all three would be the same
 * arbitrary slice of the catalogue under three headings that each claim something
 * untrue. Inventing merchandising is what got earlier homepage copy rejected
 * twice. One band, named for what it actually is.
 *
 * **No newsletter block.** No subscription endpoint exists anywhere, and a form
 * that discards an email address is worse than no form.
 *
 * **No star ratings on the cards.** See the note in product-card.tsx: there is no
 * rating field, so five stars on every product is fabricated social proof.
 *
 * ## Where the copy comes from
 *
 * The hero and guarantee copy — "DIN 2012", the phone number, SEAP, the 10.000
 * figure — is quoted from the owner's design file. That provenance is the whole
 * reason it is allowed to be here: this project rejected invented product and
 * business claims twice, and the distinction is that these were supplied rather
 * than composed. Anything the design does not state is still absent.
 */

async function Finder() {
  const brands = await listPrinterBrands();

  return (
    <PrinterFinder
      brands={brands.map((brand) => ({ slug: brand.slug, name: brand.name }))}
    />
  );
}

/** Must reserve the finder's exact box, or the swap shifts the band below it. */
function FinderSkeleton() {
  return (
    <div
      className="h-19 animate-pulse rounded-lg bg-black/5 sm:h-22"
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
            className="border-border bg-card hover:border-foreground/30 focus-visible:ring-ring inline-block rounded-full border px-4 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
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
      {Array.from({ length: 10 }, (_, i) => (
        <li key={i}>
          <div className="bg-muted h-9.5 w-24 animate-pulse rounded-full" />
        </li>
      ))}
    </ul>
  );
}

/**
 * Guarantees, quoted from the design. Each is a fact about the business that the
 * storefront has no other source for, so it is reproduced rather than reworded —
 * paraphrasing an owner's claim is how a claim quietly changes meaning.
 */
const GUARANTEES = [
  { title: "Promotii zilnice", detail: "preturi imbatabile" },
  { title: "Achizitii SEAP", detail: "suntem prezenti pe SEAP" },
  { title: "+40 762 095 550", detail: "orice intrebare are raspuns" },
  { title: "Livrare rapida", detail: "in toata tara" },
] as const;

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="text-primary size-5 shrink-0"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SectionHeading({
  title,
  href,
  linkLabel,
}: {
  title: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="mb-5 flex items-baseline justify-between gap-4">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <Link
        href={href}
        className="text-primary focus-visible:ring-ring shrink-0 rounded text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
      >
        {linkLabel} →
      </Link>
    </div>
  );
}

export default function Home() {
  return (
    <main>
      {/*
        The hero is a band, and the finder card overlaps its bottom edge — hence
        the padding here and the negative margin below, rather than absolute
        positioning, which would not reflow when the copy wraps on a phone.
      */}
      <section className="bg-primary text-white">
        <div className="max-w-page mx-auto px-4 pt-14 pb-24 text-center sm:pt-20 sm:pb-28">
          <p className="text-brand-muted-foreground text-xs font-bold tracking-[0.12em] uppercase">
            Din 2012 · Calitate si responsabilitate
          </p>
          <h1 className="mx-auto mt-5 max-w-2xl text-3xl leading-tight font-extrabold tracking-tight sm:text-[2.5rem]">
            Toner si cartuse compatibile, pentru orice echipament de birou
          </h1>
          <p className="text-brand-muted-foreground mx-auto mt-4 max-w-xl">
            Peste 10.000 de repere compatibile si originale, livrate rapid in
            toata tara.
          </p>
        </div>
      </section>

      <div className="max-w-page mx-auto -mt-16 px-4">
        <div className="border-border bg-card rounded-lg border p-4 shadow-sm sm:p-6">
          <h2 className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
            Cauta consumabile dupa modelul echipamentului
          </h2>
          <div className="mt-4">
            <Suspense fallback={<FinderSkeleton />}>
              <Finder />
            </Suspense>
          </div>
        </div>
      </div>

      <section
        aria-label="De ce REPrint"
        className="max-w-page mx-auto px-4 py-10"
      >
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {GUARANTEES.map((item) => (
            <li key={item.title} className="flex items-start gap-2.5">
              <CheckIcon />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-muted-foreground text-sm">{item.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-surface border-border border-y">
        <div className="max-w-page mx-auto px-4 py-12">
          {/*
            Named for what it is. The design's "Produse HOT" would need a
            popularity signal the contract does not have.
          */}
          <SectionHeading
            title="Din catalog"
            href="/produse"
            linkLabel="Vezi tot catalogul"
          />
          <Suspense fallback={<ProductGridSkeleton count={4} />}>
            <ProductStrip count={4} />
          </Suspense>
        </div>
      </section>

      <section className="max-w-page mx-auto px-4 py-12">
        <SectionHeading
          title="Marci de imprimante"
          href="/produse"
          linkLabel="Vezi tot catalogul"
        />
        <Suspense fallback={<BrandLinksSkeleton />}>
          <BrandLinks />
        </Suspense>
      </section>
    </main>
  );
}
