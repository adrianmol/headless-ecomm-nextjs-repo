/**
 * What to ask HUB for when a customer types a product code.
 *
 * HUB resolves a sku without regard to case but is exact about everything else
 * — measured on 2026-09-28: `cn-pgi29c` finds CN-PGI29C, while `CNPGI29C` and a
 * trailing space both find nothing. A code never contains a space, so a typed
 * one is either noise (`CN-PGI 29C`) or a dash the customer left out
 * (`CN PGI29C`). Both readings are tried; a missing dash with no space typed
 * cannot be guessed, and needs the search route (docs/hub-api-gaps.md §2).
 */

/** Longer than any code, and the bound on what reaches the catalogue cache. */
const MAX_LENGTH = 64;

export function codeCandidates(raw: string): string[] {
  const query = raw.trim().replace(/\s+/g, " ");
  if (query === "" || query.length > MAX_LENGTH) return [];
  return [...new Set([query.replaceAll(" ", ""), query.replaceAll(" ", "-")])];
}
