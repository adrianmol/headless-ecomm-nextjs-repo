/**
 * Deterministic idempotency keys.
 *
 * The key must collapse an accidental *retry* while still allowing a genuine
 * repeat of the same action. Those look identical if you key on
 * (operation, cartId, variantId, quantity) alone: a customer legitimately
 * adding a second copy of the same item would be silently swallowed.
 *
 * Including the cart version disambiguates them. The version increments on
 * every successful mutation, so:
 *   - a retry of one intent carries the same version -> same key -> collapsed
 *   - a genuine second action happens after the version moved -> new key -> applied
 *
 * A random UUID per call would defeat the purpose entirely.
 */

/** FNV-1a, used only to bound key length. Not a security primitive. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

const MAX_KEY_LENGTH = 255;

export function idempotencyKey(
  operation: string,
  ...parts: readonly (string | number)[]
): string {
  const raw = [operation, ...parts].join(":");
  if (raw.length <= MAX_KEY_LENGTH) return raw;
  return `${operation}:${fnv1a(raw)}`;
}
