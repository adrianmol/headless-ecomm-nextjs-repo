---
name: checkout-flow
description: Checkout and hosted payment redirect rules for this storefront — address and shipping forms, idempotent checkout session creation, redirecting to the PSP, and securely verifying order status on return. Use when working on checkout steps, order creation, the PSP redirect, the return Route Handler, or the confirmation page.
triggers:
  - user
  - model
---

# Checkout Flow

Payments use a **hosted redirect**. The frontend never touches card data, so PCI scope stays minimal.
Frontend responsibility ends at "create the order intent and redirect".

## Steps

1. **Collect address + shipping** via Server-Action-driven forms. Zod-validate on submit for UX; the
   backend re-validates for enforcement. Client validation is never the control.
2. **Create the checkout session:** `POST /checkout/sessions` with an `Idempotency-Key` derived from
   cart id + cart version. A double-clicked Pay button must not create two orders.
3. **Redirect** to the PSP URL returned by the backend.
4. **Verify on return** in `app/(checkout)/checkout/return/route.ts`.
5. **Confirm** — render order state fetched from our backend.

## The security rule that matters most

**Treat every query parameter on the return URL as attacker-controlled.** The customer can edit it.

```ts
// app/(checkout)/checkout/return/route.ts
export async function GET(req: Request) {
  const ref = new URL(req.url).searchParams.get("ref"); // an identifier ONLY
  const order = await getOrderStatus(ref); // our backend is the truth
  switch (order.status) {
    case "paid":
      return redirect(`/orders/${order.id}`);
    case "pending":
      return redirect(`/checkout/confirming?ref=${ref}`);
    case "failed":
      return redirect("/checkout?error=payment_failed");
  }
}
```

Never branch on `?status=success`, `?paid=true`, or any amount in the URL. Trusting the return URL is
how a storefront ships free products.

## Pending payments are a real state

The PSP webhook may not have reached the backend when the customer returns. Do **not** guess. Render a
"confirming your payment" screen that polls order status with backoff, and give it a timeout path to a
support message. Asserting success or failure early produces either double-charges chased by support or
customers who abandon a paid order.

## Cookies and the redirect

The session cookie must be `SameSite=Lax`, not `Strict`. The PSP return is a cross-site top-level
navigation, and `Strict` drops the cookie — the customer returns logged out with no cart. This only
reproduces against a real PSP, so it is easy to ship.

## Confirmation page

- Non-cacheable, `noindex`.
- Reads order state from the backend; never from URL parameters or client state.
- Safe to re-load and to share-by-accident without leaking another customer's order — authorise the
  order read against the session.

## Price changes at checkout

If the backend reports `PriceChanged` during checkout, stop and surface it. The customer must see and
accept the new total. Never let an optimistic or previously-rendered total become the charged amount.

## Tests

- Return handler ignores forged `status` / amount parameters
- Pending status polls rather than asserting an outcome
- Duplicate checkout session creation with the same idempotency key yields one order
- Session survives the cross-site return (cookie `SameSite` regression test)
- E2E happy path against PSP test mode, plus payment-failed and price-changed
