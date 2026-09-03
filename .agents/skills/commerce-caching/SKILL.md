---
name: commerce-caching
description: Caching and revalidation policy for this storefront — what may be cached, TTLs per data class, tag-based invalidation, and the PDP streaming pattern that keeps prices fresh behind a cached shell. Use when adding a cached fetch, choosing a TTL, wiring revalidateTag, adding Suspense boundaries, or debugging stale prices and stock.
triggers:
  - user
  - model
---

# Commerce Caching

Uniform caching is how storefronts ship stale prices. Always classify the data first.

## Policy table

| Data | Strategy | Invalidation |
| --- | --- | --- |
| Product / category content | Cached, long TTL | Tag-based, on backend publish |
| Price and availability | Short TTL (seconds) or uncached | Time-based |
| Cart, session, orders | **Never cached** | n/a |
| Search / facets | Cached per query params | Time-based |

If you cannot confidently place new data in a row of this table, it is not cacheable yet. Ask.

## Defaults

Since Next.js 15 `fetch` is not cached by default. Caching is **opt-in** — keep it that way. Prefer the
framework's own primitives (`use cache` with `cacheTag` / `cacheLife` where stable in this Next
version, otherwise tagged `unstable_cache`). Do not build a bespoke cache layer; it will diverge from
the framework's invalidation and produce stale data nobody can explain.

## Tagging

Tag everything cached, with a stable scheme:

```
product:<id>      category:<slug>      search:<hash>      cart:<cartId>
```

Invalidate with `revalidateTag`, never `revalidatePath` for commerce data — path revalidation blows away
unrelated pages and hides the actual dependency.

Catalog caching depends on a backend publish webhook calling into a revalidation Route Handler. Without
that webhook the only honest options are stale catalog or no catalog caching. Do not paper over its
absence with a short TTL and hope.

## PDP streaming pattern

The point is a static-fast first paint that can never show a stale price.

```tsx
export default async function ProductPage({ params }) {
  const product = await getProductShell(params.slug);   // cached, long TTL
  return (
    <>
      <ProductGallery images={product.images} />
      <h1>{product.title}</h1>
      <Suspense fallback={<PriceSkeleton />}>
        <LivePrice slug={params.slug} />                  {/* uncached / short TTL */}
      </Suspense>
    </>
  );
}
```

- Shell: title, images, description, SEO metadata — cached and streamed immediately.
- Price and stock: fresh fetch inside `<Suspense>`.
- **`PriceSkeleton` must reserve the exact final height.** Otherwise the price swap costs CLS and eats
  the 0.05 budget. This is the most common regression in this pattern.

## Never cache

Cart, session, order, and payment status are per-user and mutable. Any of these appearing inside a
cached scope is a correctness bug, not a tuning issue. The PSP return handler and the order
confirmation page must be explicitly non-cacheable and `noindex`.

## Debugging stale data

1. Which policy row does the data belong to? Wrong row is the usual cause.
2. Is a cached function transitively pulling per-user data? That both leaks and staleifies.
3. Did the write path call `revalidateTag` with the same tag string the read path used? Mismatched tag
   strings fail silently — this is why the tag scheme above is fixed.
