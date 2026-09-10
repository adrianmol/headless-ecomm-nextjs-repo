import { redirect } from "next/navigation";

/**
 * Translates the printer finder's GET form submission into a canonical
 * compatibility URL.
 *
 * The finder is a plain `<form method="get">` so it needs no JavaScript (see
 * `components/commerce/printer-finder.tsx`), but a GET form can only produce
 * query parameters — and the canonical compatibility URLs are path-based
 * (`/compatibil/brother/hl-2130`) so they are clean, linkable and indexable.
 * This handler is the bridge.
 *
 * **Why a route handler and not a page.** Reading `searchParams` is runtime
 * data, so doing this in `/compatibil/page.tsx` would stop that page from
 * prerendering and cost it its static shell — for a page whose only other job
 * is rendering a form. A redirect is not a page; this keeps the two apart.
 *
 * It also lives under `/api` rather than at `/compatibil/cauta`, which would
 * sit inside the `/compatibil/[brand]` namespace and silently shadow any brand
 * whose slug happened to be `cauta`.
 */

/**
 * Values are validated against a strict slug pattern before being interpolated
 * into the redirect target. Without this a crafted `?brand=` could inject path
 * segments — these parameters come straight from a query string and are
 * untrusted. `redirect()` with a relative path cannot leave the origin, but it
 * could still be steered to an unintended route.
 */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugParam(value: string | null): string | undefined {
  if (value === null) return undefined;
  if (value.length === 0 || value.length > 64) return undefined;
  return SLUG.test(value) ? value : undefined;
}

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const brand = slugParam(params.get("brand"));
  const model = slugParam(params.get("model"));

  // No brand chosen (or a malformed one) means the shopper submitted the empty
  // form: send them back to the finder rather than to a listing of everything,
  // which would look like the choice was ignored.
  if (!brand) redirect("/compatibil");

  // A model is only meaningful under its brand, and the brand page renders the
  // finder again with that brand's models filled in — which is the finder's
  // deliberate second step.
  redirect(model ? `/compatibil/${brand}/${model}` : `/compatibil/${brand}`);
}
