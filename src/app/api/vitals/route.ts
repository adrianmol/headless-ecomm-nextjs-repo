/**
 * Sink for field Core Web Vitals from src/components/web-vitals.tsx.
 *
 * Writes structured single-line JSON to stdout, because container logs are the
 * only telemetry sink this project has until a collector exists. When one does,
 * this is the single place to change — the client keeps posting here.
 *
 * This is a public, unauthenticated endpoint that anyone on the internet can
 * post anything to, so it is written defensively:
 *
 *  - the body is read through a hard streaming byte cap, never buffered whole
 *  - every logged field comes from a fixed, finite set of our own values
 *  - it always answers 204, so a malformed beacon never becomes a client error
 *
 * Nothing here is stored, rendered, or echoed back.
 */

const ALLOWED_METRICS = new Set([
  "LCP",
  "CLS",
  "INP",
  "FCP",
  "TTFB",
  "FID",
  "Next.js-hydration",
]);

/** web-vitals only ever emits these three. */
const ALLOWED_RATINGS = new Set(["good", "needs-improvement", "poor"]);

/** A beacon is a few hundred bytes. Anything larger is not one. */
const MAX_BODY_BYTES = 1024;

/** One hour in ms. Bounds a metric to something physically plausible. */
const MAX_METRIC_VALUE = 3_600_000;

/**
 * Reads at most `max` bytes from the request stream, cancelling as soon as the
 * limit is exceeded. Returns `null` if the body is oversized or unreadable.
 *
 * Deliberately not `request.text()`: that buffers whatever the client chooses
 * to send before any size check can run, which makes a size check after the
 * fact decorative. The limit has to be enforced *while* reading.
 *
 * Counted in bytes, not string length. `text.length` counts UTF-16 code units,
 * so a multi-byte payload measures smaller than it really is.
 */
async function readCappedBody(request: Request, max: number): Promise<string | null> {
  // Content-Length is attacker-controlled: it can be absent, or lie in either
  // direction. It is used only as a cheap early rejection, never as the
  // protection itself — the streaming limit below is what actually holds.
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isFinite(length) || length < 0 || length > max) return null;
  }

  if (request.body === null) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > max) {
        // Stop pulling immediately. Anything else lets the client decide how
        // much memory this process spends.
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(buffer);
}

/**
 * Route templates this storefront actually serves. The logged `route` is always
 * one of these strings or `"other"` — never client input.
 */
const ROUTE_TEMPLATES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/$/, "/"],
  [/^\/products$/, "/products"],
  [/^\/products\/[A-Za-z0-9._~-]+$/, "/products/[slug]"],
  [/^\/cart$/, "/cart"],
  [/^\/checkout$/, "/checkout"],
  [/^\/checkout\/confirming$/, "/checkout/confirming"],
  [/^\/orders\/[A-Za-z0-9._~-]+$/, "/orders/[id]"],
];

const UNKNOWN_ROUTE = "other";

/**
 * Maps a client-supplied pathname onto one of our own route templates.
 *
 * Normalising to a template rather than sanitising the string is the point:
 * the output is drawn from a fixed set, so no caller-controlled text can reach
 * the logs at all — no query strings, no control characters, no credentials in
 * a userinfo segment, no traversal, no injected newlines.
 *
 * It also drops identifiers as a side effect. `/orders/ord_9djp` logs as
 * `/orders/[id]`, so an order reference never lands in a log line.
 */
function toRouteTemplate(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    return UNKNOWN_ROUTE;
  }

  // Bare pathname only: leading slash, then unreserved characters. This alone
  // excludes "?", "#", "@", ":", "%", whitespace and every control character.
  if (!/^\/[A-Za-z0-9/._~-]*$/.test(value)) return UNKNOWN_ROUTE;
  if (value.includes("..") || value.includes("//")) return UNKNOWN_ROUTE;

  for (const [pattern, template] of ROUTE_TEMPLATES) {
    if (pattern.test(value)) return template;
  }
  return UNKNOWN_ROUTE;
}

const noContent = () => new Response(null, { status: 204 });

export async function POST(request: Request) {
  const text = await readCappedBody(request, MAX_BODY_BYTES);
  if (text === null || text.length === 0) return noContent();

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return noContent();
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return noContent();
  }

  const metric = payload as Record<string, unknown>;

  const name = typeof metric.name === "string" ? metric.name : null;
  if (name === null || !ALLOWED_METRICS.has(name)) return noContent();

  const value = typeof metric.value === "number" ? metric.value : null;
  if (value === null || !Number.isFinite(value) || value < 0 || value > MAX_METRIC_VALUE) {
    return noContent();
  }

  // `rating` is as attacker-controlled as anything else in this payload, so it
  // is checked against the known set rather than logged as given.
  const rating =
    typeof metric.rating === "string" && ALLOWED_RATINGS.has(metric.rating)
      ? metric.rating
      : undefined;

  console.log(
    JSON.stringify({
      event: "web_vital",
      name,
      value: Math.round(value * 1000) / 1000,
      rating,
      route: toRouteTemplate(metric.path),
    }),
  );

  return noContent();
}
