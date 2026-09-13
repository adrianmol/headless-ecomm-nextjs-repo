/**
 * URLs for HUB categories, which have no slug of their own.
 *
 * Every one of the 11,991 categories returns `url: ""`, so the storefront has to
 * mint its own. The shape is `name-id`:
 *
 *   /categorii/lexmark-cx510de-25968
 *
 * The id is appended rather than relied upon alone for two reasons. A bare
 * `/categorii/25968` tells a shopper and a search engine nothing, and a bare
 * `/categorii/lexmark-cx510de` would need a name lookup — which means either
 * holding all 11,991 names in memory on every request or a second round trip, and
 * would break outright on the duplicate names this catalogue has (three separate
 * categories are called "CX510de (28E0512)" and its siblings).
 *
 * With the id trailing, the lookup is exact and the readable part is free to
 * change: a renamed category keeps working on its old URL, and the canonical form
 * can be redirected to. That is the same reason `/produse/{slug}` is safe for
 * products — those do have real slugs from the backend.
 */

/**
 * The id is the last hyphen-separated run of digits.
 *
 * Anchored at the end so names that themselves end in digits are unambiguous:
 * "1100" becomes `1100-21724` and parses back to 21724, not 1100.
 */
const TRAILING_ID = /-(\d+)$/;

/** Bare digits, for the degenerate case of a category with an empty name. */
const ONLY_DIGITS = /^\d+$/;

/**
 * Strips diacritics and punctuation to ASCII words joined by hyphens.
 *
 * Romanian names carry ă â î ș ț, and a URL containing them is legal but arrives
 * percent-encoded in logs, analytics and support tickets — `%C8%99` where a human
 * expected `s`. Folding them is kinder than preserving them here.
 */
function slugify(name: string): string {
  return (
    name
      .normalize("NFD")
      // Combining marks, i.e. the accents NFD just split off.
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}

/**
 * Builds the canonical URL segment for a category.
 *
 * A category with no usable name degrades to just the id, which is still a working
 * URL rather than a broken one — `-25968` with a leading hyphen would be neither.
 */
export function hubCategorySlug(category: {
  id: number;
  name: string;
}): string {
  const readable = slugify(category.name);
  return readable ? `${readable}-${category.id}` : String(category.id);
}

/**
 * Recovers the id from a URL segment, or `null` when there is none to recover.
 *
 * Returning null rather than throwing: a malformed category URL is a bad link,
 * which is a 404, not a fault. The caller decides.
 */
export function hubCategoryIdFromSlug(slug: string): number | null {
  const trailing = TRAILING_ID.exec(slug);
  const digits = trailing ? trailing[1] : ONLY_DIGITS.test(slug) ? slug : null;
  if (digits === null) return null;

  const id = Number(digits);
  /*
    Only nonsense is rejected: zero, non-integers and anything past safe integer
    range, where Number() would silently round and resolve the wrong category.

    Oddly-formed-but-parseable segments are deliberately accepted — `x--5` and
    `x-007` both resolve. They are not canonical, and
    `isCanonicalHubCategorySlug` is what catches that, so the visitor gets a
    redirect to the real URL instead of a 404. An earlier version of this comment
    claimed padded ids were rejected; they were not, and being redirected is the
    better behaviour anyway.
  */
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return id;
}

/*
  There was an `isCanonicalHubCategorySlug` here, for redirecting non-canonical
  URLs to the canonical one. Removed rather than left unreferenced: the redirect it
  existed for cannot be issued from where the category name becomes known — the
  response has already begun — so the canonical URL is declared in
  `generateMetadata` instead, which needs no comparison. Middleware is the place a
  redirect could still work, and this is easy enough to reinstate there if that is
  ever wanted.
*/
