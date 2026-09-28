import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getHubProduct } from "@/commerce/hub/queries";
import { CodeSearch } from "@/components/commerce/code-search";
import { WhatsAppLink } from "@/components/commerce/whatsapp-link";
import { Reveal } from "@/components/reveal";
import { codeCandidates } from "@/lib/code-query";
import { whatsappNumber } from "@/lib/env";
import { whatsappHref } from "@/lib/whatsapp";
import {
  HubProductGrid,
  HubProductGridSkeleton,
} from "../(catalog)/_hub/hub-product-grid";

/**
 * Search by product code — the part of the plan's stage 8 the contract can
 * answer today.
 *
 * HUB has no search route. It does resolve a product by its exact code, so a
 * typed code finds that product and the same consumable from other
 * manufacturers. An OEM code, a printer model or a name find nothing yet, and
 * the page says so and offers the ways that do work — the plan's rule that
 * search is never a dead end. Everything missing is in docs/hub-api-gaps.md §2.
 *
 * Results are a page, not a redirect to the product: by the time the lookup
 * resolves the response has begun, and a redirect can no longer be issued.
 */

export const metadata: Metadata = {
  title: "Caută după cod",
  // Search results are not content. Links stay followable: they are products.
  robots: { index: false, follow: true },
};

async function Results({
  searchParams,
}: {
  searchParams: PageProps<"/cauta">["searchParams"];
}) {
  // HUB requests are signed with a timestamp; see queries.ts.
  await connection();

  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  if (query === "") return null;

  let product = null;
  try {
    for (const code of codeCandidates(query)) {
      // The product page's own lookup, so a result is already cached for it.
      product = await getHubProduct(
        { by: "sku", value: code },
        { withVariants: true },
      );
      if (product) break;
    }
  } catch {
    return (
      <p role="status" className="text-muted-foreground mt-8">
        Căutarea nu este disponibilă momentan. Încearcă din nou în câteva
        minute.
      </p>
    );
  }

  if (product) {
    return (
      <section className="mt-8" aria-labelledby="results-heading">
        <h2 id="results-heading" className="mb-5 text-lg font-bold">
          Rezultate pentru „{query}”
        </h2>
        <HubProductGrid products={[product, ...(product.variants ?? [])]} />
      </section>
    );
  }

  const whatsapp = whatsappNumber();

  return (
    <section className="mt-8 max-w-2xl" aria-labelledby="results-heading">
      <h2 id="results-heading" className="text-lg font-bold">
        Nu am găsit niciun produs cu codul „{query}”
      </h2>
      <p className="text-muted-foreground mt-2 text-sm">
        Căutarea găsește deocamdată doar codul de produs REPrint, scris
        întocmai. Dacă ai codul de pe cartuș sau modelul imprimantei, pornește
        de la echipament.
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Link
          href="/modele"
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
        >
          Caută după echipament
        </Link>
        {whatsapp && (
          <WhatsAppLink
            className="sm:w-auto"
            href={whatsappHref(
              whatsapp,
              `Bună! Caut un produs și nu l-am găsit pe site: ${query}`,
            )}
          />
        )}
      </div>
    </section>
  );
}

export default function SearchPage({ searchParams }: PageProps<"/cauta">) {
  return (
    <main className="max-w-page mx-auto px-4 py-10">
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
        Caută după cod
      </h1>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
        Scrie codul produsului, de exemplu CN-PGI29C.
      </p>

      {/*
        Not pre-filled with the query: reading it here would be runtime data
        outside the boundary and stop the shell prerendering. The results
        heading repeats what was searched.
      */}
      <CodeSearch
        id="cauta-cod"
        label="Caută după codul produsului"
        className="mt-5 max-w-xl"
      />

      {/*
        The height is held here rather than by the skeleton, because what loads
        is either a row of cards or, with nothing searched yet, nothing at all —
        and a skeleton can only match one of them.
      */}
      <div className="min-h-[32rem]">
        <Reveal fallback={<ResultsSkeleton />}>
          <Results searchParams={searchParams} />
        </Reveal>
      </div>
    </main>
  );
}

function ResultsSkeleton() {
  return (
    <div className="mt-8" aria-hidden>
      <div className="bg-muted mb-5 h-7 w-64 animate-pulse rounded" />
      <HubProductGridSkeleton count={4} />
    </div>
  );
}
