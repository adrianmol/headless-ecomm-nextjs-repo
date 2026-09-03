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
});

let cached: z.infer<typeof envSchema> | null = null;

export function serverEnv(): z.infer<typeof envSchema> {
  if (cached) return cached;

  const parsed = envSchema.safeParse({
    COMMERCE_API_URL: process.env.COMMERCE_API_URL,
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
