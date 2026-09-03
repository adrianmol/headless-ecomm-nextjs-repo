# ADR-0002: Server-authoritative cart with optimistic UI

- **Status:** Accepted
- **Date:** 2026-09-03
- **Deciders:** Frontend architecture

## Context

The cart is the highest-traffic mutable state in a storefront and directly determines what a customer
is charged. The backend already owns cart persistence.

## Decision

The backend is the sole source of truth for the cart. The frontend holds a cart identifier in an
`httpOnly` cookie, reads the cart in Server Components, and mutates it exclusively through Server
Actions. Client-side optimistic updates via `useOptimistic` are permitted for perceived latency but
are **display-only**.

## Alternatives considered

**Client-side cart (localStorage + a client store).** Rejected. It cannot be server-rendered, so the
cart flashes in after hydration; it does not survive a device change; and it makes abandoned-cart
recovery impossible because the server never sees the cart.

**Server cart with no optimistic layer.** Rejected on UX grounds — every add-to-cart would show a
full network round trip on the critical interaction of the entire site.

## Consequences

- No hydration drift: server-rendered cart matches client state by construction.
- Cart survives devices and sessions; abandoned-cart recovery becomes a backend capability.
- Mutations require idempotency keys, since Server Actions can be retried and users double-click.
  This is a hard dependency on the backend.
- Cart creation **cannot** happen during Server Component render, because cookies cannot be set during
  render. Carts are created in the Server Action handling the first add-to-cart. Side benefit: no
  orphaned empty carts polluting abandonment metrics.
- Any financial figure shown optimistically must be reconciled from the server response before it is
  presented as the amount payable.
- Quantity controls must debounce and coalesce, or a held button produces racing writes.

## Reversibility

Moderate. The read path would need to move to client fetching and the write path away from Server
Actions, but the domain model and API contract would survive.
