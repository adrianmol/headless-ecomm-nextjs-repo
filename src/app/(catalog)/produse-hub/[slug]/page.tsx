import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getHubProduct } from "@/commerce/hub/queries";
import type { HubProductDetail } from "@/commerce/hub/schemas";
import { Price } from "@/components/commerce/price";
import { HubStockBadge } from "@/components/commerce/stock-badge";
import { HubProductGrid } from "../../_hub/hub-product-grid";
import { discountPercent } from "@/lib/money";

/**
 * A HUB catalogue product.
 *
 * Sits beside `/produse/[slug]` rather than replacing it: that route is backed by
 * the provisional contract and this one by HUB, and the two catalogues have
 * different identifiers. Merging them means one of the two backends winning, which
 * is a decision for when the migration finishes, not a side effect of this page.
 *
 * This page exists because the previous commit linked HUB cards at `/produse/{slug}`
 * — a route that queries the *other* API. Every card was a dead link that surfaced
 * as `CommerceErrorException: Unavailable` from `getProduct`. Worth recording: the
 * cards rendered perfectly and the failure only appeared on click, which is why it
 * survived a screenshot review.
 *
 * ## No add-to-cart
 *
 * HUB exposes no cart, checkout or order endpoints, so there is nothing to add to.
 * Rather than a dead button or a page with no way to act, it shows the phone number
 * from the owner's design file — the one purchase route that demonstrably exists.
 * When a cart backend is chosen, this is where the button goes.
 */

/** From the owner's design file, the same number the footer and homepage use. */
const ORDER_PHONE = "+40 762 095 550";

/**
 * Canonical URL, because a product has two working URLs.
 *
 * `hubProductHref` uses the slug when there is one and the sku otherwise, and the
 * page resolves either — so `/produse-hub/chip-lcx310k` and
 * `/produse-hub/CHIP-LCX310K` are the same product. Without a canonical they are two
 * indexable URLs for one page. The slug form wins where it exists, since it is the
 * one a person can read.
 *
 * A missing product calls `notFound()` here rather than returning empty metadata:
 * returning metadata suppresses the not-found page's `robots: noindex`, which turns
 * a soft 404 into an indexable one.
 */
export async function generateMetadata({
  params,
}: PageProps<"/produse-hub/[slug]">): Promise<Metadata> {
  const { slug } = await params;

  let product;
  try {
    product = await resolveProduct(slug);
  } catch {
    // Transient upstream failure: let the body deal with it.
    return {};
  }

  /*
    Returns empty metadata for a missing product; the body's `notFound()` is what
    renders the 404 surface. Measured against production this yields exactly one
    `<meta name="robots" content="noindex">`.

    Calling `notFound()` here as well — which is what the provisional PDP does —
    produced additional identical tags on these routes. The two routes differ in
    how they discover absence (this one resolves a slug then a sku, and returns
    null rather than throwing), so the PDP's arrangement does not transfer, and one
    directive is the thing that matters rather than which call site produces it.
  */
  if (!product) return {};

  return {
    title: product.name,
    alternates: {
      canonical: `/produse-hub/${encodeURIComponent(product.slug || product.sku)}`,
    },
  };
}

async function resolveProduct(key: string): Promise<HubProductDetail | null> {
  /*
    A slug first, then the sku. HUB resolves a product by id, sku or `?url=slug`
    interchangeably, but `hubProductHref` falls back to the sku for the products
    whose `url` is empty — so a segment here can legitimately be either, and only
    trying both makes every card's link work.
  */
  const bySlug = await getHubProduct(
    { by: "slug", value: key },
    { withVariants: true },
  );
  if (bySlug) return bySlug;

  return getHubProduct({ by: "sku", value: key }, { withVariants: true });
}

function Spec({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="border-border flex gap-4 border-b py-2 last:border-b-0">
      <dt className="text-muted-foreground w-40 shrink-0 text-sm">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

async function ProductView({
  params,
}: {
  params: PageProps<"/produse-hub/[slug]">["params"];
}) {
  // Every HUB request is signed with a timestamp, so it reads the clock and cannot
  // be prerendered. See queries.ts.
  await connection();

  const { slug } = await params;
  const product = await resolveProduct(slug);
  if (!product) notFound();

  const { offer, stock } = product;
  const payable = offer.promoPrice ?? offer.price;
  const percent =
    offer.price && offer.promoPrice
      ? discountPercent(offer.promoPrice, offer.price)
      : null;

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="bg-muted relative aspect-square overflow-hidden rounded-lg">
          {product.imageUrl && (
            <Image
              src={product.imageUrl}
              // Upstream supplies no alt text; the product name is the honest
              // substitute rather than an invented description.
              alt={product.name}
              width={800}
              height={800}
              sizes="(min-width: 1024px) 50vw, 100vw"
              priority
              className="h-full w-full object-contain"
            />
          )}
        </div>

        <div>
          {product.brand && (
            <p className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
              {product.brand}
            </p>
          )}
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
            {product.name}
          </h1>

          {product.summary && (
            <p className="text-muted-foreground mt-3 text-sm">
              {product.summary}
            </p>
          )}

          <div className="border-border bg-card mt-6 rounded-lg border p-5">
            {offer.displayable && payable ? (
              <div className="flex flex-wrap items-baseline gap-3">
                <Price
                  price={payable}
                  compareAtPrice={
                    offer.promoPrice ? (offer.price ?? undefined) : undefined
                  }
                  showDiscountBadge={false}
                />
                {percent !== null && (
                  <span className="bg-promo text-promo-foreground rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums">
                    −{percent}%
                  </span>
                )}
              </div>
            ) : (
              // `show: false` means a price exists but must not be shown, which is
              // not the same as having none. Both need a reason, not a blank.
              <p className="text-muted-foreground">Preț la cerere</p>
            )}

            <div className="mt-3">
              <HubStockBadge state={stock.state} label={stock.label} />
            </div>

            {/*
              No cart exists upstream, so this is the only purchase route that is
              real. Stated plainly rather than dressed up as a button that would
              have nothing behind it.
            */}
            <p className="mt-5 text-sm">
              Comenzi telefonic:{" "}
              <a
                href={`tel:${ORDER_PHONE.replace(/\s/g, "")}`}
                className="text-primary focus-visible:ring-ring rounded font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none"
              >
                {ORDER_PHONE}
              </a>
            </p>
          </div>

          <dl className="mt-6">
            <Spec label="Cod produs" value={product.sku} />
            <Spec label="Cod oferta" value={product.offerCode} />
            <Spec label="Producator" value={product.manufacturer} />
            <Spec label="Tip" value={product.type} />
            <Spec label="Capacitate" value={product.capacity} />
            <Spec label="Culoare" value={product.colour} />
            <Spec label="EAN" value={product.ean} />
            <Spec label="Coduri OEM" value={product.oem} />
          </dl>
        </div>
      </div>

      {product.descriptionHtml && (
        <section className="mt-12 max-w-3xl">
          <h2 className="text-lg font-bold">Descriere</h2>
          {/*
            Rendered as text, never as markup. The contract calls this field HTML,
            but 14 of 14 live descriptions sampled contained no tags at all — and
            the project rule is that backend prose is not rendered as HTML anyway.
            React escapes this, so a value that does start carrying tags will look
            wrong rather than execute, which is the right way round.
          */}
          <p className="text-muted-foreground mt-3 text-sm whitespace-pre-line">
            {product.descriptionHtml}
          </p>
        </section>
      )}

      {product.specs.length > 0 && (
        <section className="mt-12 max-w-3xl">
          <h2 className="text-lg font-bold">Caracteristici</h2>
          {/*
            A list, not a map: the same name legitimately repeats — "Compatibil OEM"
            has dozens of values — so keying by it would keep only the last.
          */}
          <dl className="mt-3">
            {product.specs.map((spec, i) => (
              <Spec
                key={`${spec.name}-${i}`}
                label={spec.name}
                value={spec.value}
              />
            ))}
          </dl>
        </section>
      )}

      {product.variants && product.variants.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-5 text-lg font-bold">
            Alti producatori pentru acelasi cod
          </h2>
          {/* HUB's own framing: siblings share an offer code. */}
          <HubProductGrid products={product.variants} />
        </section>
      )}
    </>
  );
}

export default function HubProductPage({
  params,
}: PageProps<"/produse-hub/[slug]">) {
  return (
    <main className="max-w-page mx-auto px-4 py-10">
      <Suspense
        fallback={
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="bg-muted aspect-square animate-pulse rounded-lg" />
            <div>
              <div className="bg-muted h-3 w-20 animate-pulse rounded" />
              <div className="bg-muted mt-2 h-9 w-4/5 animate-pulse rounded" />
              <div className="bg-muted mt-6 h-40 animate-pulse rounded-lg" />
            </div>
          </div>
        }
      >
        <ProductView params={params} />
      </Suspense>

      <p className="mt-12 text-sm">
        <Link
          href="/produse"
          className="text-primary focus-visible:ring-ring rounded hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          ← Vezi tot catalogul
        </Link>
      </p>
    </main>
  );
}
