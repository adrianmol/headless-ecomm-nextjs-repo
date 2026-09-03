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
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;

  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "storefront",
  });
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
      path: request.path,
      routePath: context.routePath,
      routeType: context.routeType,
    }),
  );
}
