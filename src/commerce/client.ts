import "server-only";
import createClient, { type Middleware } from "openapi-fetch";
import { context, propagation } from "@opentelemetry/api";
import type { paths } from "./api";
import { serverEnv } from "@/lib/env";
import { authHeaders } from "./session";

/**
 * The only place the storefront talks to the commerce API.
 *
 * `import 'server-only'` above is load-bearing: it turns an accidental import
 * from a Client Component into a build error rather than a runtime credential
 * leak. Do not remove it, and do not re-export these clients from a module that
 * client code imports.
 *
 * There are deliberately two clients:
 *
 *   publicCommerceClient — catalog. Sends no session.
 *   commerceClient       — cart, checkout, orders. Forwards the session.
 *
 * The split is not stylistic. Catalog responses are cached and shared across
 * every visitor, and two things break if they carry a session:
 *
 *   1. Correctness/security — a per-user response could be written into a shared
 *      cache entry and served to somebody else.
 *   2. Mechanics — reading cookies is a runtime API, and Next.js forbids it
 *      inside a `use cache` scope, so a session-forwarding client cannot be
 *      called from cached catalog reads at all.
 */

const forwardSession: Middleware = {
  async onRequest({ request }) {
    for (const [key, value] of Object.entries(await authHeaders())) {
      request.headers.set(key, value);
    }
    return request;
  },
};

/**
 * Injects W3C trace context (`traceparent`) into every outbound call.
 *
 * This is what makes a slow page diagnosable. Next.js sits in front of the
 * commerce API, so without a shared trace a slow PDP is just "slow" — with one,
 * the span tree says whether the time went in rendering or upstream, which is
 * the difference between a frontend task and a backend conversation
 * (architecture §8, §9).
 *
 * A no-op until `instrumentation.ts` registers a provider: with no active span
 * the propagator injects nothing, so this costs an empty function call and adds
 * no headers. Applied to both clients — catalog latency matters as much as cart
 * latency, and it carries no user data, unlike the session.
 */
const propagateTrace: Middleware = {
  onRequest({ request }) {
    propagation.inject(context.active(), request.headers, {
      set: (headers: Headers, key: string, value: unknown) =>
        headers.set(key, String(value)),
    });
    return request;
  },
};

let cachedAuthed: ReturnType<typeof createClient<paths>> | null = null;
let cachedPublic: ReturnType<typeof createClient<paths>> | null = null;

/** Session-forwarding client. Cart, checkout, orders — never catalog. */
export function commerceClient() {
  if (cachedAuthed) return cachedAuthed;
  const client = createClient<paths>({ baseUrl: serverEnv().COMMERCE_API_URL });
  client.use(propagateTrace);
  client.use(forwardSession);
  cachedAuthed = client;
  return cachedAuthed;
}

/** Session-free client for cacheable, non-user-specific catalog reads. */
export function publicCommerceClient() {
  if (cachedPublic) return cachedPublic;
  const client = createClient<paths>({ baseUrl: serverEnv().COMMERCE_API_URL });
  client.use(propagateTrace);
  cachedPublic = client;
  return cachedPublic;
}

/** Test seam: drops the memoised clients so a test can vary the base URL. */
export function resetCommerceClientCache(): void {
  cachedAuthed = null;
  cachedPublic = null;
}
