import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { RotateCcw, ShieldCheck, Truck } from "lucide-react";
import {
  getHubCategories,
  getHubLiveOffers,
  getHubProduct,
} from "@/commerce/hub/queries";
import { addHubToCartAction } from "@/commerce/session-cart/actions";
import type {
  HubOffer,
  HubProductDetail,
  HubProductSummary,
  HubStock,
} from "@/commerce/hub/schemas";
import {
  printerName,
  resolveTaxonomy,
  type HubPrinter,
} from "@/commerce/hub/taxonomy";
import { AddToCart } from "@/components/commerce/add-to-cart";
import { Breadcrumbs, type Crumb } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { Price } from "@/components/commerce/price";
import { HubStockBadge } from "@/components/commerce/stock-badge";
import { WhatsAppLink } from "@/components/commerce/whatsapp-link";
import { Reveal } from "@/components/reveal";
import { formatCostPerPage, pagesFromCapacity } from "@/lib/cost-per-page";
import { storefrontOrigin, whatsappNumber } from "@/lib/env";
import { hubProductType } from "@/lib/hub-product-types";
import { hubCategorySlug } from "@/lib/hub-slug";
import { formatYield } from "@/lib/locale";
import { discountPercent, formatMoney } from "@/lib/money";
import { firstOemCode, productJsonLd } from "@/lib/product-json-ld";
import { productQuestion, whatsappHref } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

/**
 * A HUB catalogue product — the plan's stage 3.3.
 *
 * Sits beside `/produse/[slug]` rather than replacing it: that route is backed by
 * the provisional contract and this one by HUB, and the two catalogues have
 * different identifiers. Which one wins is recorded in docs/storefront-plan.md.
 *
 * ## What is fresh and what is cached
 *
 * Name, image, description and specifications come from the cached product
 * record. **Price and stock do not**: they are read from HUB's `live` endpoint
 * on every request, for this product and its siblings in one call. The plan's
 * rule is that the price in the HTML must be the real one — Merchant Center
 * compares it with the feed — and a record cached for hours cannot promise
 * that. If `live` cannot be reached the cached figures are shown instead, and
 * add-to-cart re-prices live before anything lands in the cart either way.
 *
 * All of it renders on the server, in one boundary, so the price, the button
 * and the structured data arrive in the delivered HTML and never disagree.
 *
 * ## What the plan has here and this page does not
 *
 * Quantity tiers, the 30-day lowest price, the delivery day, the exact stock
 * figure, the "Recomandat REPrint" badge, the bundle offer, the other quality
 * levels, reviews and questions. None of them is in the contract; each is
 * listed in docs/hub-api-gaps.md §1.2. They are absent rather than estimated.
 */

/** From the owner's design file, the same number the footer and homepage use. */
const ORDER_PHONE = "+40 762 095 550";

/**
 * Entries in HUB's `features` that are not about the product: which marketplace
 * feeds it is exported to, and a grouping flag. Found on the live catalogue —
 * "Feed: skroutz.ro", "Feed: cel.ro", "Cover grup: Nu" — and of no use to a
 * buyer. Reported to HUB in docs/hub-api-gaps.md §5; hidden here meanwhile.
 */
const INTERNAL_SPECS = new Set(["Feed", "Cover grup"]);

/** How many printers are listed before the rest go behind "Afișați mai mult". */
const PRINTERS_SHOWN = 12;

const productPath = (product: { slug: string; sku: string }) =>
  `/produse-hub/${encodeURIComponent(product.slug || product.sku)}`;

/**
 * Canonical URL, because a product has two working URLs.
 *
 * The page resolves a slug or a sku, so `/produse-hub/chip-lcx310k` and
 * `/produse-hub/CHIP-LCX310K` are the same product. Without a canonical they are
 * two indexable URLs for one page. The slug form wins where it exists, since it
 * is the one a person can read.
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
    `<meta name="robots" content="noindex">`. Calling `notFound()` here as well
    produced additional identical tags on these routes.
  */
  if (!product) return {};

  const origin = storefrontOrigin();
  const title = product.metaTitle || product.name;
  const description =
    product.metaDescription || product.summary || product.name;
  const path = productPath(product);

  return {
    title,
    description,
    ...(origin ? { metadataBase: new URL(origin) } : {}),
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: "REPrint",
      locale: "ro_RO",
      images: product.imageUrl ? [{ url: product.imageUrl, alt: title }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: product.imageUrl ? [product.imageUrl] : [],
    },
  };
}

async function resolveProduct(key: string): Promise<HubProductDetail | null> {
  /*
    A slug first, then the sku. HUB resolves a product by id, sku or `?url=slug`
    interchangeably, but links fall back to the sku for the products whose `url`
    is empty — so a segment here can legitimately be either, and only trying
    both makes every link work.
  */
  const bySlug = await getHubProduct(
    { by: "slug", value: key },
    { withVariants: true },
  );
  if (bySlug) return bySlug;

  return getHubProduct({ by: "sku", value: key }, { withVariants: true });
}

type Figures = {
  offer: HubOffer;
  stock: HubStock;
  /** HUB no longer sells it: asked for, and not returned. */
  withdrawn: boolean;
};

/**
 * Fresh price and stock for the product and its siblings, in one request.
 *
 * Returns a lookup rather than a list so a caller cannot forget the fallback:
 * every product gets figures, fresh where HUB supplied them.
 */
async function freshFigures(
  products: readonly HubProductSummary[],
): Promise<(product: HubProductSummary) => Figures> {
  const cached = (product: HubProductSummary): Figures => ({
    offer: product.offer,
    stock: product.stock,
    withdrawn: false,
  });

  let live;
  try {
    live = await getHubLiveOffers({ skus: products.map((p) => p.sku) });
  } catch {
    // The page is worth more than the freshness: show what the record holds.
    return cached;
  }

  // HUB compares skus without regard to case, so this does too.
  const key = (sku: string) => sku.toLowerCase();
  const entries = new Map(live.entries.map((e) => [key(e.sku), e]));
  const missing = new Set(live.missing.map(key));

  return (product) => {
    const entry = entries.get(key(product.sku));
    if (entry) {
      return { offer: entry.offer, stock: entry.stock, withdrawn: false };
    }
    // Ignoring `missing` would keep a withdrawn product's old price on screen —
    // the bug the field exists to prevent.
    return missing.has(key(product.sku))
      ? { ...cached(product), withdrawn: true }
      : cached(product);
  };
}

/** Printers and family, or nothing when the tree cannot be read. */
async function taxonomyOf(product: HubProductDetail) {
  try {
    // Same arguments as /modele and the homepage, so one cache entry serves all.
    const categories = await getHubCategories({ withCounts: true });
    return resolveTaxonomy(product.categoryIds, categories);
  } catch {
    return { printers: [], families: [] };
  }
}

const payableOf = (offer: HubOffer) =>
  offer.displayable ? (offer.promoPrice ?? offer.price) : null;

/**
 * The line under the title: the codes a buyer matches against the old cartridge.
 * Monospaced because `0`/`O` and `1`/`l` are compared character by character.
 */
function Codes({ product }: { product: HubProductDetail }) {
  const oem = firstOemCode(product.oem);
  const parts = [
    { label: "Cod", value: product.sku, mono: true },
    { label: "OEM", value: oem ?? "", mono: true },
    { label: "Marcă", value: product.manufacturer, mono: false },
  ].filter((part) => part.value);

  return (
    <p className="text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
      {parts.map((part) => (
        <span key={part.label}>
          {part.label}:{" "}
          <span
            className={cn("text-foreground", part.mono && "font-mono text-xs")}
          >
            {part.value}
          </span>
        </span>
      ))}
    </p>
  );
}

/** Quoted from the plan. Facts about the business, supplied by its owner. */
function Guarantees() {
  const items = [
    {
      Icon: ShieldCheck,
      text: "Garanție 1:1, schimb imediat până la 50% consum",
    },
    { Icon: RotateCcw, text: "Retur 14 zile" },
    { Icon: Truck, text: "Transport gratuit peste 500 lei" },
  ];
  return (
    <ul className="text-muted-foreground border-border mt-5 space-y-2 border-t pt-5 text-sm">
      {items.map(({ Icon, text }) => (
        <li key={text} className="flex items-start gap-2">
          <Icon aria-hidden className="text-primary mt-0.5 size-4 shrink-0" />
          {text}
        </li>
      ))}
    </ul>
  );
}

/**
 * The other manufacturers of the same consumable — HUB's `related`, which
 * shares an offer code. An out-of-stock one is set back and stays visible, as
 * the plan asks: knowing it exists is information.
 */
function Variants({
  variants,
  figures,
}: {
  variants: readonly HubProductSummary[];
  figures: (product: HubProductSummary) => Figures;
}) {
  const shown = variants
    .map((variant) => ({ variant, ...figures(variant) }))
    .filter(({ withdrawn }) => !withdrawn);
  if (shown.length === 0) return null;

  return (
    <section className="mt-12" aria-labelledby="variants-heading">
      <h2 id="variants-heading" className="text-lg font-bold">
        Același consumabil, alți producători
      </h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        {shown.map(({ variant, offer, stock }) => {
          const price = payableOf(offer);
          return (
            <li key={variant.id}>
              <Link
                href={productPath(variant)}
                className={cn(
                  "border-border bg-card hover:border-foreground/30 focus-visible:ring-ring flex flex-col rounded-lg border px-4 py-3 text-sm focus-visible:ring-2 focus-visible:outline-none",
                  // Set back by a dashed edge and a quieter name, not by
                  // opacity: fading the chip took its text to 2.49:1, under
                  // the 4.5:1 minimum.
                  !stock.orderable && "text-muted-foreground border-dashed",
                )}
              >
                <span className="font-semibold">
                  {variant.manufacturer || variant.name}
                </span>
                <span className="tabular-nums">
                  {price ? formatMoney(price) : "Preț la cerere"}
                </span>
                {/* Upstream's wording, so it matches the badge on that page. */}
                <span className="text-muted-foreground text-xs">
                  {stock.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PrinterLinks({
  printers,
  what,
}: {
  printers: readonly HubPrinter[];
  what: string;
}) {
  return (
    <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {printers.map((printer) => (
        <li key={printer.id}>
          {/* Says what the product is for that printer, as the plan asks. */}
          {what} pentru{" "}
          <Link
            href={`/categorii-hub/${hubCategorySlug(printer)}`}
            className="text-primary focus-visible:ring-ring rounded font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {printerName(printer)}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Every row links to that printer's collection. A long list keeps its tail
 * behind a native disclosure: still in the delivered HTML, for search engines,
 * and no JavaScript to open it.
 */
function Compatibility({
  printers,
  what,
}: {
  printers: readonly HubPrinter[];
  what: string;
}) {
  if (printers.length === 0) return null;
  const rest = printers.slice(PRINTERS_SHOWN);

  return (
    <section className="mt-12" aria-labelledby="compat-heading">
      <h2 id="compat-heading" className="text-lg font-bold">
        Compatibilitate
      </h2>
      <PrinterLinks printers={printers.slice(0, PRINTERS_SHOWN)} what={what} />
      {rest.length > 0 && (
        <details className="mt-3">
          <summary className="text-primary focus-visible:ring-ring cursor-pointer rounded text-sm font-medium focus-visible:ring-2 focus-visible:outline-none">
            Afișați mai mult ({rest.length})
          </summary>
          <PrinterLinks printers={rest} what={what} />
        </details>
      )}
    </section>
  );
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

  const variants = product.variants ?? [];
  const [figures, taxonomy] = await Promise.all([
    freshFigures([product, ...variants]),
    taxonomyOf(product),
  ]);

  const { offer, stock, withdrawn } = figures(product);
  const payable = withdrawn ? null : payableOf(offer);
  const percent =
    payable && offer.price && offer.promoPrice
      ? discountPercent(offer.promoPrice, offer.price)
      : null;

  const pages = pagesFromCapacity(product.capacity);
  const costPerPage =
    payable && pages ? formatCostPerPage(payable, pages) : null;

  const type = hubProductType(product.type);
  const family = taxonomy.families[0];
  const origin = storefrontOrigin();
  const whatsapp = whatsappNumber();

  const crumbs: Crumb[] = [
    { name: "Acasă", href: "/" },
    // No page of their own yet: HUB publishes neither the main categories nor a
    // usable brand listing (docs/hub-api-gaps.md §1.3).
    ...(type.type ? [{ name: type.plural }] : []),
    ...(product.brand ? [{ name: product.brand }] : []),
    ...(family
      ? [
          {
            name: family.name,
            href: `/categorii-hub/${hubCategorySlug(family)}`,
          },
        ]
      : []),
    { name: product.name, href: productPath(product) },
  ];

  return (
    <>
      <Breadcrumbs crumbs={crumbs} origin={origin} />

      <div className="grid gap-8 lg:grid-cols-2">
        {/* White, not muted: HUB's photos are on white and rarely square, so
            a tinted box shows as bands above and below the letterboxed image. */}
        <div className="border-border relative aspect-square overflow-hidden rounded-lg border bg-white">
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
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            {product.name}
          </h1>
          <Codes product={product} />

          {product.summary && (
            <p className="text-muted-foreground mt-3 text-sm">
              {product.summary}
            </p>
          )}

          <div className="border-border bg-card mt-6 rounded-lg border p-5">
            {withdrawn ? (
              <p className="text-muted-foreground">
                Produsul nu mai este disponibil.
              </p>
            ) : payable ? (
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
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
                {costPerPage && (
                  <p className="text-muted-foreground text-sm tabular-nums">
                    {costPerPage}
                  </p>
                )}
              </div>
            ) : (
              // `show: false` means a price exists but must not be shown, which is
              // not the same as having none. Both need a reason, not a blank.
              <p className="text-muted-foreground">Preț la cerere</p>
            )}

            {!withdrawn && (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <HubStockBadge state={stock.state} label={stock.label} />
                {pages && (
                  <span className="text-muted-foreground text-sm">
                    {formatYield(pages)}
                  </span>
                )}
              </div>
            )}

            {/* The action re-checks price and stock live before anything lands
                in the cart, whatever this page was able to read. */}
            <AddToCart
              variantId={product.sku}
              inStock={!withdrawn && stock.orderable && payable !== null}
              action={addHubToCartAction}
              wrapperClassName="mt-5"
              productName={product.name}
              imageUrl={product.imageUrl}
              withQuantity
            />

            {/* Once per page, beside add-to-cart — never on the sibling chips. */}
            {whatsapp && (
              <WhatsAppLink
                className="mt-2"
                href={whatsappHref(
                  whatsapp,
                  productQuestion(product.sku, product.name),
                )}
              />
            )}

            <p className="mt-4 text-sm">
              Sau telefonic:{" "}
              <a
                href={`tel:${ORDER_PHONE.replace(/\s/g, "")}`}
                className="text-primary focus-visible:ring-ring rounded font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none"
              >
                {ORDER_PHONE}
              </a>
            </p>

            <Guarantees />
          </div>
        </div>
      </div>

      <Variants variants={variants} figures={figures} />

      <Compatibility printers={taxonomy.printers} what={type.singular} />

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

      <section className="mt-12 max-w-3xl">
        <h2 className="text-lg font-bold">Fișă tehnică</h2>
        <dl className="mt-3">
          <Spec label="Tip" value={type.type ? type.singular : product.type} />
          {/* Colour and yield are in `features` below, in HUB's own words. */}
          <Spec label="EAN" value={product.ean} />
          <Spec label="Cod ofertă" value={product.offerCode} />
          {/*
            A list, not a map: the same name legitimately repeats — "Compatibil OEM"
            has dozens of values — so keying by it would keep only the last.
          */}
          {product.specs
            .filter((spec) => !INTERNAL_SPECS.has(spec.name))
            .map((spec, i) => (
              <Spec
                key={`${spec.name}-${i}`}
                label={spec.name}
                value={spec.value}
              />
            ))}
        </dl>
      </section>

      <JsonLd
        data={productJsonLd({
          name: product.name,
          sku: product.sku,
          url: origin
            ? new URL(productPath(product), origin).toString()
            : undefined,
          imageUrl: product.imageUrl,
          description: product.metaDescription || product.summary,
          brand: product.brand,
          manufacturer: product.manufacturer,
          ean: product.ean,
          oem: product.oem,
          // The figures rendered above, not a second reading of them.
          price: payable,
          stockState: stock.state,
          printers: taxonomy.printers.map(printerName),
        })}
      />
    </>
  );
}

export default function HubProductPage({
  params,
}: PageProps<"/produse-hub/[slug]">) {
  return (
    <main className="max-w-page mx-auto px-4 py-10">
      <Reveal
        fallback={
          // ProductView's shape, band for band: breadcrumbs, image, a two-line
          // title, the codes, and the offer card with price, stock pill,
          // button and guarantees.
          <div aria-hidden>
            <div className="bg-muted mb-6 h-5 w-80 max-w-full animate-pulse rounded" />
            <div className="grid gap-8 lg:grid-cols-2">
              <div className="bg-muted aspect-square animate-pulse rounded-lg" />
              <div>
                <div className="bg-muted h-8 w-4/5 animate-pulse rounded" />
                <div className="bg-muted mt-2 h-8 w-3/5 animate-pulse rounded" />
                <div className="bg-muted mt-2 h-5 w-64 animate-pulse rounded" />
                <div className="border-border mt-6 rounded-lg border p-5">
                  <div className="bg-muted h-8 w-36 animate-pulse rounded" />
                  <div className="bg-muted mt-3 h-6 w-28 animate-pulse rounded-full" />
                  <div className="bg-muted mt-5 h-8 w-full animate-pulse rounded-lg" />
                  <div className="bg-muted mt-4 h-5 w-52 animate-pulse rounded" />
                  <div className="border-border mt-5 space-y-2 border-t pt-5">
                    <div className="bg-muted h-5 w-72 max-w-full animate-pulse rounded" />
                    <div className="bg-muted h-5 w-32 animate-pulse rounded" />
                    <div className="bg-muted h-5 w-56 animate-pulse rounded" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        }
      >
        <ProductView params={params} />
      </Reveal>

      <p className="mt-12 text-sm">
        <Link
          href="/modele"
          className="text-primary focus-visible:ring-ring rounded hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          ← Alege alt echipament
        </Link>
      </p>
    </main>
  );
}
