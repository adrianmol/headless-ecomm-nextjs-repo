import "server-only";
import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./api";
import { serverEnv } from "@/lib/env";
import { authHeaders } from "./session";

/**
 * The only place the storefront talks to the commerce API.
 *
 * `import 'server-only'` above is load-bearing: it turns an accidental import
 * from a Client Component into a build error rather than a runtime credential
 * leak. Do not remove it, and do not re-export this client from a module that
 * client code imports.
 */

const forwardSession: Middleware = {
  async onRequest({ request }) {
    for (const [key, value] of Object.entries(await authHeaders())) {
      request.headers.set(key, value);
    }
    return request;
  },
};

let cached: ReturnType<typeof createClient<paths>> | null = null;

export function commerceClient() {
  if (cached) return cached;
  const client = createClient<paths>({ baseUrl: serverEnv().COMMERCE_API_URL });
  client.use(forwardSession);
  cached = client;
  return cached;
}

/** Test seam: drops the memoised client so a test can vary the base URL. */
export function resetCommerceClientCache(): void {
  cached = null;
}
