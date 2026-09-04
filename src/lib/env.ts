import "server-only";
import { z } from "zod";

/**
 * Server-only configuration.
 *
 * None of these may ever be prefixed `NEXT_PUBLIC_`: the commerce API lives on a
 * private network (ADR-0001) and its address is not something the browser needs
 * or should learn.
 *
 * Read lazily rather than at module load so that importing this file does not
 * crash a build in an environment where the variable is legitimately absent.
 */
const envSchema = z.object({
  COMMERCE_API_URL: z.url(),
  STOREFRONT_URL: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.url().optional(),
  ),
});

let cached: z.infer<typeof envSchema> | null = null;

export function serverEnv(): z.infer<typeof envSchema> {
  if (cached) return cached;

  const parsed = envSchema.safeParse({
    COMMERCE_API_URL: process.env.COMMERCE_API_URL,
    STOREFRONT_URL: process.env.STOREFRONT_URL,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid server environment: ${parsed.error.issues
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join("; ")}`,
    );
  }

  cached = parsed.data;
  return cached;
}

/** Test seam: clears the memoised value so a test can vary the environment. */
export function resetServerEnvCache(): void {
  cached = null;
}

/**
 * Minimum accepted length for the catalog invalidation secret.
 * `.env.example` suggests `openssl rand -hex 32`, which is 64 characters.
 */
const MIN_REVALIDATE_SECRET_LENGTH = 32;

export type RevalidateSecret =
  | { state: "missing" }
  | { state: "too_short"; length: number }
  | { state: "ok"; secret: string };

/**
 * The catalog invalidation secret, validated here rather than at the call site
 * so that every environment variable is described in this module.
 *
 * **Deliberately not part of `envSchema`.** A value in that schema is validated
 * by `serverEnv()`, which the commerce client calls on every request — so a weak
 * webhook secret would throw on catalog reads and take the whole storefront
 * down. A shared secret for a cache-invalidation webhook must not have that
 * blast radius: the correct failure is an inert webhook, not a dead shop.
 *
 * Returns a state rather than a string so the caller decides the response, and
 * so "absent" stays distinguishable from "present but too weak to accept".
 */
export function revalidateSecret(): RevalidateSecret {
  const raw = process.env.REVALIDATE_SECRET;
  if (!raw) return { state: "missing" };
  if (raw.length < MIN_REVALIDATE_SECRET_LENGTH) {
    return { state: "too_short", length: raw.length };
  }
  return { state: "ok", secret: raw };
}
