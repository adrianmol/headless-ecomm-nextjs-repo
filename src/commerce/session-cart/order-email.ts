import "server-only";
import { formatMoney } from "@/lib/money";
import type { SessionOrder } from "./cart";

/**
 * Delivers a session order to the shop by email, via Resend's HTTP API, and
 * sends the customer their own confirmation.
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

function billingLines(order: SessionOrder): string[] {
  if (!order.billing) return ["Facturare: persoana fizica"];
  return [
    "Facturare pe firma:",
    `  Firma:        ${order.billing.company}`,
    `  CUI:          ${order.billing.cui}`,
    ...(order.billing.regCom
      ? [`  Nr. Reg. Com.: ${order.billing.regCom}`]
      : []),
  ];
}

const productLines = (order: SessionOrder) =>
  order.lines.map(
    (line) =>
      `- ${line.quantity} x ${line.name ?? line.sku} (${line.sku}) — ${formatMoney(line.lineTotal)}`,
  );

export function orderEmailText(order: SessionOrder): string {
  return [
    `Comanda noua ${order.id} — ${order.createdAt}`,
    "",
    `Client:  ${order.name}`,
    `Telefon: ${order.phone}`,
    `Email:   ${order.email}`,
    `Adresa:  ${order.address}`,
    "",
    ...billingLines(order),
    "",
    "Produse:",
    ...productLines(order),
    "",
    `Total: ${formatMoney(order.total)}`,
    "",
    "Preturi HUB live la momentul comenzii. Nicio plata nu a fost incasata.",
  ].join("\n");
}

/**
 * The customer's copy. Says only what this flow actually does next — the shop
 * calls, nothing has been charged — and repeats the details so a wrong phone
 * number or address is caught by the customer before the call, not during it.
 */
export function customerEmailText(order: SessionOrder): string {
  return [
    `Buna ziua, ${order.name},`,
    "",
    `Am primit comanda ${order.id}. Multumim!`,
    "",
    `Ce urmeaza: te sunam la ${order.phone} ca sa confirmam produsele si`,
    "livrarea. Nu ai platit nimic inca.",
    "",
    "Produse:",
    ...productLines(order),
    "",
    `Total: ${formatMoney(order.total)}`,
    "",
    `Livrare: ${order.address}`,
    ...billingLines(order),
    "",
    "Daca ceva nu este corect, raspunde la acest email.",
    "",
    "Echipa REPrint",
  ].join("\n");
}

type Message = {
  to: string[];
  replyTo: string;
  subject: string;
  text: string;
};

async function send(
  message: Message,
  idempotencyKey: string,
  event: string,
): Promise<boolean> {
  const cfg = config();
  if (!cfg) {
    // Names only, never values.
    console.error(JSON.stringify({ event: `${event}_unconfigured` }));
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
        to: message.to,
        reply_to: message.replyTo,
        subject: message.subject,
        text: message.text,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) return true;
    console.error(
      JSON.stringify({ event: `${event}_failed`, status: response.status }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: `${event}_failed`,
        reason: error instanceof Error ? error.name : "unknown",
      }),
    );
  }
  return false;
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
  return send(
    {
      to: cfg?.to ?? [],
      replyTo: order.email,
      subject: `Comanda noua ${order.id}`,
      text: orderEmailText(order),
    },
    idempotencyKey,
    "order_email",
  );
}

/**
 * Best effort, and only after the shop's email succeeded: the order already
 * exists at that point, so a failure here is logged and reported on the
 * confirmation page, never turned into a failed order.
 *
 * Replies go to the shop. The recipient and several fields are customer-typed,
 * which is why every field is length-capped by the schema and the body is
 * plain text. Each send also places a real order at the shop, which makes the
 * form a poor relay for anyone hoping to email strangers through us.
 */
export async function sendCustomerConfirmation(
  order: SessionOrder,
  idempotencyKey: string,
): Promise<boolean> {
  const cfg = config();
  if (!cfg) return false;
  return send(
    {
      to: [order.email],
      replyTo: cfg.to[0],
      subject: `Am primit comanda ${order.id} — REPrint`,
      text: customerEmailText(order),
    },
    idempotencyKey,
    "customer_email",
  );
}
