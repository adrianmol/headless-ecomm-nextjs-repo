/**
 * "Did you mean …@gmail.com?" for the checkout email field.
 *
 * A mistyped domain is the one checkout error the customer cannot discover: the
 * address is valid, the order goes through, and the confirmation email simply
 * never arrives. So this suggests, and never blocks or rewrites — "mail.com" and
 * "gmx.net" are real providers a stricter rule would "correct".
 *
 * Runs in the browser only, as a hint. The server does not consult it.
 */

/** Domains customers of a Romanian shop actually use, plus lookalikes to leave alone. */
const KNOWN_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "yahoo.ro",
  "ymail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  // Real providers one or two edits from the ones above.
  "mail.com",
  "gmx.com",
  "gmx.net",
  "proton.me",
  "protonmail.com",
];

/** The domains worth suggesting, i.e. the known list minus the lookalikes. */
const SUGGESTABLE = KNOWN_DOMAINS.slice(0, 8);

/**
 * Optimal string alignment distance: Levenshtein plus adjacent transposition,
 * so "gmial" is one edit from "gmail" rather than two.
 */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** The corrected address, or null when there is nothing worth suggesting. */
export function suggestEmail(input: string): string | null {
  const email = input.trim();
  const at = email.lastIndexOf("@");
  if (at < 1 || at === email.length - 1) return null;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (KNOWN_DOMAINS.includes(domain)) return null;

  let best: { domain: string; distance: number } | null = null;
  for (const candidate of SUGGESTABLE) {
    const distance = editDistance(domain, candidate);
    if (distance > 0 && distance <= 2 && (!best || distance < best.distance)) {
      best = { domain: candidate, distance };
    }
  }
  return best ? `${local}@${best.domain}` : null;
}
