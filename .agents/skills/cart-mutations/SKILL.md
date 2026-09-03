---
name: cart-mutations
description: Pattern for cart mutations in this storefront — Server Actions, idempotency keys, cart creation and cookie timing, useOptimistic display-only updates, debounced quantity controls, and revalidation. Use when adding or changing add-to-cart, remove-line, quantity update, cart merge on login, or any cart write path.
triggers:
  - user
  - model
---

# Cart Mutations

The backend owns the cart (ADR-0002). Reads happen in Server Components; **writes happen only in
Server Actions**. No client code calls a cart endpoint.

## Canonical shape

```ts
'use server';

export async function addToCart(variantId: string, qty: number) {
  const cartId = await getOrCreateCart();          // sets cookie if absent
  const { error } = await client.POST('/carts/{id}/lines', {
    params: { path: { id: cartId } },
    headers: { 'Idempotency-Key': idempotencyKey('add', cartId, variantId, qty) },
    body: { variantId, quantity: qty },
  });
  if (error) return { ok: false as const, error: normalizeError(error) };
  revalidateTag(`cart:${cartId}`);
  return { ok: true as const };
}
```

## Rules

**Idempotency key on every mutation.** Server Actions can be retried and users double-click. Derive the
key deterministically from the operation + cart id + payload, so a retry of the *same* intent collapses
while a genuine second add still counts. Never use a random UUID per call — that defeats the purpose.

**Cart creation timing.** Cookies cannot be set during Server Component render. So:

- Do **not** create a cart while rendering a page.
- Create it inside the Server Action handling the first write.
- Side benefit: no orphaned empty carts distorting abandonment metrics.

**Return errors, do not throw** for expected domain failures (`OutOfStock`, `PriceChanged`,
`CartExpired`). The form needs to render them. Reserve throwing for genuine faults.

**Revalidate by tag** (`cart:${cartId}`) after every successful write. Never `revalidatePath('/')`.

## Optimistic UI

Use `useOptimistic` in a **thin client island** — the cart badge, the quantity stepper. Never make a
layout or a page a Client Component to get optimistic state.

Two rules that matter:

- **Optimistic values are display-only.** Line counts and badge numbers may be optimistic. Any figure
  presented as the amount payable comes from the server response. Reconcile before showing totals at
  checkout.
- **Debounce and coalesce quantity changes.** A held `+` button otherwise produces a request storm with
  responses arriving out of order. Debounce ~300 ms and send the final absolute quantity, not a
  sequence of deltas.

## Stock conflicts

When the server rejects with `OutOfStock`, the optimistic state is already wrong. Reconcile to the
server's authoritative line state and show what changed — silently reverting confuses customers who
watched the number go up.

## Cart merge on login

Merge semantics are **backend-owned** so web and any future client behave identically. The frontend
calls the merge endpoint after authentication and re-reads the cart. Do not implement merge logic in
the frontend.

## Tests to write

- Concurrent quantity updates converge to the correct final quantity
- Double-submit with the same idempotency key creates one line, not two
- `OutOfStock` reconciles optimistic state correctly
- Guest cart survives login and merges
