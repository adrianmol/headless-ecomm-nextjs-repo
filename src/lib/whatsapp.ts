/**
 * A "Discută pe WhatsApp" link with the message already written.
 *
 * The customer starts the conversation, so it needs no marketing consent and no
 * approved template (plan, stage 7).
 *
 * @param number Digits with the country code and no plus, e.g. `40762095550`.
 * That is the only form `wa.me` accepts; `whatsappNumber()` produces it.
 */
export function whatsappHref(number: string, message: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** The plan's wording for the product page, quoted rather than reworded. */
export function productQuestion(sku: string, name: string): string {
  return `Bună! Am o întrebare despre ${sku} — ${name}`;
}

/**
 * The cart's message. The plan has it carry the cart's short code, which needs
 * a cart saved in HUB; until then it lists what is in the cart, so whoever
 * answers can see it without asking.
 */
export function cartQuestion(
  lines: ReadonlyArray<{ sku: string; quantity: number }>,
): string {
  const contents = lines
    .map((line) => `${line.sku} × ${line.quantity}`)
    .join(", ");
  return `Bună! Am o întrebare despre coșul meu: ${contents}`;
}
