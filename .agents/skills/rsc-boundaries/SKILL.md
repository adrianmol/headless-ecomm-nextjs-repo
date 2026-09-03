---
name: rsc-boundaries
description: Rules for the Server/Client Component split in this Next.js App Router storefront — where 'use client' is allowed, keeping client components as leaves, bundle and Core Web Vitals budgets, and server-only enforcement. Use when adding a component, adding 'use client', adding interactivity or a hook, or investigating bundle size and LCP regressions.
triggers:
  - user
  - model
---

# RSC Boundaries

Default to Server Components. `'use client'` is a deliberate, reviewable decision.

## The core rule

**Client components are leaves.** A `'use client'` directive ships that component *and its entire
imported subtree* to the browser. Putting it on a layout or page pulls the whole tree client-side and
silently forfeits the reason for using RSC.

Legitimate client components here:

- add-to-cart button, quantity stepper
- image gallery / carousel
- filter and sort panel
- cart badge with optimistic count

Not client components: layouts, pages, product cards, price display, anything purely presentational.

## Where interactivity meets data

Never lift a component to the client to get data. Fetch on the server and pass plain, serialised props
down into the client leaf.

```tsx
// server
const product = await getProduct(slug);
return <AddToCartButton variantId={product.defaultVariantId} />;  // client leaf, plain props
```

Server Actions are the bridge for writes — a client leaf calls an action, it does not call the API.

## Enforcement

- `src/commerce/client.ts` has `import 'server-only'` so a client import is a **build error**, not a
  runtime leak. Preserve this.
- ESLint boundary rule: `src/components/**` may not import `src/commerce/**`.
- Never put a secret, API base URL, or session token in a `NEXT_PUBLIC_` variable.

## Budgets

Enforced in CI (Lighthouse CI on PLP and PDP):

| Metric | Budget |
| --- | --- |
| LCP (PDP) | < 2.0 s |
| CLS | < 0.05 |
| Initial client JS | < 120 kB gzipped |

Budgets exist because RSC apps degrade *gradually* — no single change looks wrong, and code review
does not reliably catch a `'use client'` creeping up the tree. If a change breaks a budget, fix the
boundary rather than raising the number.

## Common regressions

1. `'use client'` added to a shared wrapper, dragging dozens of components client-side.
2. A heavy library (date, i18n, icon set) imported into a client leaf. Import it on the server, or
   pass the formatted result as a prop.
3. `<Suspense>` fallback whose height differs from the loaded content — CLS. Skeletons must reserve
   exact dimensions.
4. Images without explicit dimensions on PDP/PLP — LCP and CLS both suffer. Use `next/image` with
   width/height or `fill` plus a sized container.

## Accessibility

Interactive leaves are exactly where a11y breaks. Quantity steppers need real buttons and labels;
filter panels need proper roles and keyboard handling; cart updates need a live region so screen reader
users learn the cart changed. Commerce carries real legal exposure here — run axe on PLP, PDP, and cart.
