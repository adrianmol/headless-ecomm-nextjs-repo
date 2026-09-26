import "server-only";
import { formatMoney } from "@/lib/money";
import type { SessionOrder } from "./cart";

/**
 * Delivers a session order to the shop by email, via Resend's HTTP API.
 *
 * This is what makes a session order real: without it the order exists only in
 * the customer's cookie and nobody at the shop ever hears of it. So an
 * unconfigured or failing send is a failed order, never a silent success.
 *
 * Plain text on purpose: every field except the totals is customer-typed, and a
 * text body has no markup for it to inject into.
 */

const DEFAULT_API_URL = "https://api.resend.com/emails";

function config() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ORDER_EMAIL_FROM;
  const to = process.env.ORDER_EMAIL_TO;
  if (!apiKey || !from || !to) return null;
  return {
    apiKey,
    from,
    to: to.split(",").map((address) => address.trim()),
    url: process.env.ORDER_EMAIL_API_URL || DEFAULT_API_URL,
  };
}

export function orderEmailText(order: SessionOrder): string {
  return [
    `Comanda noua ${order.id} — ${order.createdAt}`,
    "",
    `Client:  ${order.name}`,
    `Telefon: ${order.phone}`,
    `Email:   ${order.email}`,
    `Adresa:  ${order.address}`,
    "",
    "Produse:",
    ...order.lines.map(
      (line) =>
        `- ${line.quantity} x ${line.name} (${line.sku}) — ${formatMoney(line.lineTotal)}`,
    ),
    "",
    `Total: ${formatMoney(order.total)}`,
    "",
    "Preturi HUB live la momentul comenzii. Nicio plata nu a fost incasata.",
  ].join("\n");
}

/**
 * @param idempotencyKey Stable per checkout attempt, so a double-submitted form
 *   produces one email rather than two orders at the shop.
 */
export async function sendOrderEmail(
  order: SessionOrder,
  idempotencyKey: string,
): Promise<boolean> {
  const cfg = config();
  if (!cfg) {
    // Names only, never values.
    console.error(JSON.stringify({ event: "order_email_unconfigured" }));
    return false;
  }

  try {
    const response = await fetch(cfg.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${cfg.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({
        from: cfg.from,
        to: cfg.to,
        reply_to: order.email,
        subject: `Comanda noua ${order.id}`,
        text: orderEmailText(order),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) return true;
    console.error(
      JSON.stringify({ event: "order_email_failed", status: response.status }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "order_email_failed",
        reason: error instanceof Error ? error.name : "unknown",
      }),
    );
  }
  return false;
}
