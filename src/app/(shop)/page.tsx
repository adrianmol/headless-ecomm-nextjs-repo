import { Suspense } from "react";
import Link from "next/link";
import { listPrinterBrands } from "@/commerce/catalog/queries";
import { PrinterFinder } from "@/components/commerce/printer-finder";
import { HubFeaturedBand } from "./(catalog)/_hub/hub-featured";
import { HubProductGridSkeleton } from "./(catalog)/_hub/hub-product-grid";

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

/**
 * The brand list, or `null` when the catalog cannot be reached.
 *
 * Every band on this page that needs brands goes through here, because a throw
 * from a cached catalog read propagates past its `<Suspense>` boundary and lands
 * on the global route error boundary — replacing the entire landing page with an
 * error screen. Observed exactly that way: `CommerceErrorException: Unavailable`
 * from `listPrinterBrands` inside a Cache scope, `GET / 200`, and then
 * `src/app/error.tsx` taking over in the browser.
 *
 * `<Suspense>` is not a safety net. It handles a pending promise, not a rejected
 * one, and the difference only shows up when the backend is down — which is the
 * moment the page most needs to still work.
 *
 * Two calls to this in one render are one request: `listPrinterBrands` is
 * `use cache`, so the second reads the first's result.
 */
async function safeBrands(): Promise<ReadonlyArray<{
  slug: string;
  name: string;
}> | null> {
  try {
    const brands = await listPrinterBrands();
    return brands.map((brand) => ({ slug: brand.slug, name: brand.name }));
  } catch {
    // Nothing is surfaced to the customer here; onRequestError already logged
    // the digest, and backend prose is never shown either way.
    return null;
  }
}

async function Finder() {
  const brands = await safeBrands();

  /*
    A message rather than an empty card. The finder is the page's primary entry
    point, so a blank box where it should be reads as a broken shop, and the
    honest thing is to say the list is unavailable and point at the catalogue —
    which is served from cache and still works.
  */
  if (brands === null) {
    return (
      <p className="text-muted-foreground text-sm">
        Lista de imprimante nu este disponibila momentan.{" "}
        <Link
          href="/produse"
          className="text-primary focus-visible:ring-ring rounded underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
        >
          Vezi tot catalogul
        </Link>
      </p>
    );
  }

  return <PrinterFinder brands={brands} />;
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

/**
 * Renders its own heading, unlike the other bands.
 *
 * So that a failure removes the section rather than leaving "Marci de imprimante"
 * above an empty strip — an orphaned heading looks more broken than an absent
 * section, and this band is entirely optional.
 */
async function BrandLinks() {
  const brands = await safeBrands();
  if (brands === null) return null;

  return (
    <>
      <SectionHeading
        title="Marci de imprimante"
        href="/modele"
        linkLabel="Vezi toate echipamentele"
      />
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
    </>
  );
}

/** Reserves the heading too, now that BrandLinks renders its own. */
function BrandLinksSkeleton() {
  return (
    <div aria-hidden>
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <div className="bg-muted h-7 w-56 animate-pulse rounded" />
        <div className="bg-muted h-5 w-32 animate-pulse rounded" />
      </div>
      <ul className="flex flex-wrap gap-2">
        {Array.from({ length: 10 }, (_, i) => (
          <li key={i}>
            <div className="bg-muted h-9.5 w-24 animate-pulse rounded-full" />
          </li>
        ))}
      </ul>
    </div>
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
          <h2 className="text-lg font-bold tracking-tight">
            Cauta consumabile
          </h2>
          <p className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
            Dupa modelul echipamentului
          </p>
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
            Real products from the HUB catalogue, which is where they actually are.
            The band names the printer model it is showing consumables for, because
            that is what the selection rule produces — see hub-featured.tsx. The
            design's "Produse HOT" would need a popularity signal no contract here
            exposes.
          */}
          <Suspense fallback={<HubProductGridSkeleton count={4} />}>
            <HubFeaturedBand count={4} />
          </Suspense>
        </div>
      </section>

      <section className="max-w-page mx-auto px-4 py-12">
        {/*
          Points at the HUB catalogue browser rather than the brand chips that used to
          be here. Those read the provisional API and linked to /compatibil/{brand},
          and HUB cannot fill those pages: only 11 of its 20 brand roots hold any
          products at all, between 1 and 20 each, because the tree's intermediate
          nodes are unpublished. Nine brands would have led to an empty page.

          Heading lives inside the band so an unreachable catalogue removes the whole
          section rather than orphaning its title.
        */}
        <Suspense fallback={<BrandLinksSkeleton />}>
          <BrandLinks />
        </Suspense>
      </section>
    </main>
  );
}
