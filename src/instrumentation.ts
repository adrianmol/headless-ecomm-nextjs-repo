import { registerOTel } from "@vercel/otel";

/**
 * Server observability (architecture §8).
 *
 * Deliberately inert unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set. There is no
 * collector for this project yet, and inventing one would either fail noisily
 * on every request or quietly send traces nowhere. With the variable set, the
 * OTLP exporter picks it up from the environment — no code change needed to
 * point this at a real backend.
 *
 * The point of tracing here is one specific question the architecture calls
 * out: Next.js adds a hop in front of the commerce API, so when a PDP is slow
 * we must be able to say whether the time went in rendering or upstream. That
 * only works if the trace context propagates across the hop — see the
 * middleware in src/commerce/client.ts.
 */
export function register() {
  assertProductionConfig();

  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;

  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "storefront",
  });
}

/**
 * Refuses to start a production server that is missing configuration the
 * storefront cannot compensate for.
 *
 * `STOREFRONT_URL` is here because its absence is silent, which is worse than a
 * crash. Measured against the standalone build with the exact environment the
 * deploy pipeline writes — `NODE_ENV`, `COMMERCE_API_URL`, `REVALIDATE_SECRET`,
 * and no `STOREFRONT_URL`:
 *
 *   PDP      200, with "STOREFRONT_URL must be configured" logged and thrown
 *            inside generateMetadata — Next swallows it and serves the page with
 *            no canonical URL and no Open Graph tags
 *   sitemap  200, and an empty <urlset>
 *
 * So the shop looks entirely healthy, the deploy's smoke test passes because
 * availability still streams, and the whole catalogue is invisible to search
 * engines. Nothing fails, which is exactly the problem.
 *
 * Startup is the right place to catch it. A container that will not start fails
 * the health check, which makes deploy.sh roll back to the previous image — so a
 * one-line configuration mistake costs a failed deploy rather than a silent
 * outage in the thing the shop exists to do.
 *
 * Production only. Local development has no reason to know the public origin, and
 * crashing `next dev` over it would be hostile.
 */
function assertProductionConfig() {
  if (process.env.NODE_ENV !== "production") return;

  const missing = ["COMMERCE_API_URL", "STOREFRONT_URL"].filter(
    (name) => !process.env[name],
  );

  if (missing.length > 0) {
    // Names only. These are configuration keys, not their values.
    throw new Error(
      `Refusing to start: ${missing.join(", ")} must be set in production. ` +
        "Without STOREFRONT_URL every product page renders without a canonical " +
        "URL or Open Graph tags and the sitemap is empty, and none of that fails " +
        "a request — see src/instrumentation.ts.",
    );
  }
}

/**
 * Longest path we will log. A path is request-controlled, so it is also a way to
 * fill the container's log ring buffer.
 */
const MAX_LOGGED_PATH_LENGTH = 256;

/**
 * Strips the query string before a path reaches the logs.
 *
 * Next hands `onRequestError` the **full** resource path including search
 * params. Measured on 2026-09-13 by erroring on
 * `/produse/force-error?session_token=…&email=…`, the log line contained the
 * token and the email verbatim. Anything a visitor puts in a query string
 * therefore reached container logs — and the sharpest case is
 * `/checkout/return`, whose query string carries the order reference and payment
 * status from the provider.
 *
 * This is the same rule `/api/vitals` already applies to client-supplied paths;
 * it simply had not been applied here.
 *
 * The pathname is kept rather than reduced to `routePath`: it is what makes an
 * error actionable, and `routePath` is logged alongside it for aggregation.
 * Dynamic ids do survive in the pathname — an order reference among them — which
 * is a deliberate difference from the vitals rule. That endpoint is public,
 * unauthenticated and high-volume, so identifiers there are noise; here a
 * reference is the thing support asks the customer to quote, and it is logged
 * only when a request actually failed.
 */
function safePath(path: string | undefined): string | undefined {
  if (path === undefined) return undefined;

  const [pathname] = path.split(/[?#]/, 1);

  // Control characters cannot appear in a legitimate path and are what would be
  // used to forge an extra log line.
  const clean = pathname.replace(/[\u0000-\u001f\u007f]/g, "");

  return clean.length > MAX_LOGGED_PATH_LENGTH
    ? `${clean.slice(0, MAX_LOGGED_PATH_LENGTH)}…`
    : clean;
}

/**
 * Server-side error reporting hook.
 *
 * Logs a digest rather than a message: in production Next replaces the message
 * with a digest anyway, and backend prose may name internal fields. The digest
 * is what correlates a customer's report with this log line.
 *
 * Structured single-line JSON so it is greppable in container logs, which is
 * all this project has until a collector exists.
 */
export async function onRequestError(
  error: unknown,
  request: { path?: string; method?: string },
  context: { routerKind?: string; routePath?: string; routeType?: string },
) {
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest: unknown }).digest)
      : undefined;

  const kind =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name: unknown }).name)
      : "Error";

  console.error(
    JSON.stringify({
      event: "request_error",
      kind,
      digest,
      method: request.method,
      path: safePath(request.path),
      routePath: context.routePath,
      routeType: context.routeType,
    }),
  );
}
