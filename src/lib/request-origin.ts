import "server-only";
import { headers } from "next/headers";

/**
 * Same-origin check for state-changing Server Actions.
 *
 * Next already compares `Origin` against `Host` for Server Actions and rejects a
 * mismatch. This exists because of what it does when the header is *absent*.
 *
 * Measured on 2026-09-04 by replaying a valid checkout Server Action against the
 * standalone production build:
 *
 * | `Origin` sent | Result |
 * | --- | --- |
 * | matching | 303 to the PSP — executed |
 * | `https://evil.test` | 500 — rejected |
 * | same host, different port | 500 — rejected |
 * | `http://evil.localhost:3101` | 500 — rejected |
 * | **absent** | **303 to the PSP — executed, order created** |
 *
 * A browser always sends `Origin` on a cross-site POST, so classic form-based
 * CSRF is already blocked by the framework. The gap is that the protection is
 * conditional on a header the storefront does not control: an intermediary that
 * strips `Origin` silently removes it, and the failure is invisible — requests
 * simply start succeeding. Defence that disappears quietly is worth replacing
 * with defence that fails loudly.
 *
 * So: a missing `Origin` on a mutation is treated as a failed check, not a pass.
 *
 * `x-forwarded-host` is honoured ahead of `host` because the deployment
 * terminates TLS in a reverse proxy (deploy/deploy.sh publishes to
 * 127.0.0.1:PORT), so `host` is the internal address while `Origin` carries the
 * public one. Both are attacker-influenced in principle, but this only ever
 * compares them to each other — it never trusts either as a URL to redirect to
 * or fetch from, which is the property that makes the comparison safe.
 */
export async function isSameOrigin(): Promise<boolean> {
  const headerList = await headers();

  const origin = headerList.get("origin");
  // Absent, empty, or the literal "null" that some privacy modes send.
  if (!origin || origin === "null") return false;

  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!host) return false;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    // Not a parseable origin: not a pass.
    return false;
  }

  return originHost === host;
}
