import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ProductListing,
  ProductListingSkeleton,
} from "../_listing/product-listing";
import { parseCatalogQuery } from "@/lib/catalog-url";

export const metadata: Metadata = {
  title: "Toate produsele",
  description:
    "Toate consumabilele compatibile din catalog: tonere, cartuse cu cerneala, unitati de cilindru, cuptoare si piese de schimb.",
};

const BASE_PATH = "/produse";

type SearchParams = Promise<{
  [key: string]: string | string[] | undefined;
}>;

function ListingFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Toate produsele</h1>
      {children}
    </main>
  );
}

async function Listing({ searchParams }: { searchParams: SearchParams }) {
  const parsed = parseCatalogQuery(await searchParams);

  // Only a malformed cursor gets here — bad facet values are dropped during
  // parsing and the listing renders unfiltered rather than erroring.
  if (!parsed.ok) {
    return (
      <div className="border-border rounded-lg border border-dashed p-10 text-center">
        <p className="font-medium">Nu am putut incarca aceasta pagina.</p>
        <p className="text-muted-foreground mt-2 text-sm">
          Linkul de paginare nu este valid.
        </p>
        <Link
          href={BASE_PATH}
          className="text-primary focus-visible:ring-ring mt-4 inline-block rounded text-sm underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
        >
          Inapoi la prima pagina
        </Link>
      </div>
    );
  }

  return <ProductListing basePath={BASE_PATH} query={parsed.query} />;
}

export default function ProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <ListingFrame>
      <Suspense fallback={<ProductListingSkeleton />}>
        <Listing searchParams={searchParams} />
      </Suspense>
    </ListingFrame>
  );
}
