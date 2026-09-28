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
  COMMERCE_API_URL: z.url().optional(),
  STOREFRONT_URL: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.url().optional(),
  ),
});

/**
 * HUB catalog API credentials.
 *
 * Separate from `envSchema` for the same reason as `revalidateSecret()`: values
 * in that schema are validated by `serverEnv()`, which the commerce client calls
 * on every request, so a missing HUB credential would throw on ordinary cart and
 * checkout reads that have nothing to do with HUB. A catalog feed being
 * unconfigured must not take the storefront down.
 *
 * The key and secret are server-only and must never be prefixed
 * `NEXT_PUBLIC_`: the secret signs requests and never leaves this process.
 */
const hubSchema = z.object({
  HUB_API_URL: z.url(),
  HUB_API_KEY: z.string().min(8),
  HUB_API_SECRET: z.string().min(32),
});

export type HubCredentials = z.infer<typeof hubSchema>;

export type HubConfig =
  | { state: "configured"; credentials: HubCredentials }
  | { state: "missing"; fields: string[] }
  | { state: "invalid"; fields: string[] };

let cachedHub: HubConfig | null = null;

/**
 * Returns a state rather than throwing, so a caller can degrade rather than
 * fail, and so "not configured yet" stays distinguishable from "configured
 * wrongly" — the second is an operator error worth surfacing differently.
 *
 * Field *names* are reported; values never are.
 */
export function hubConfig(): HubConfig {
  if (cachedHub) return cachedHub;

  const raw = {
    HUB_API_URL: process.env.HUB_API_URL,
    HUB_API_KEY: process.env.HUB_API_KEY,
    HUB_API_SECRET: process.env.HUB_API_SECRET,
  };

  const absent = Object.entries(raw)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (absent.length > 0) {
    cachedHub = { state: "missing", fields: absent };
    return cachedHub;
  }

  const parsed = hubSchema.safeParse(raw);
  cachedHub = parsed.success
    ? { state: "configured", credentials: parsed.data }
    : {
        state: "invalid",
        fields: [
          ...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "?"))),
        ],
      };
  return cachedHub;
}

/** Test seam, matching `resetServerEnvCache`. */
export function resetHubConfigCache(): void {
  cachedHub = null;
}

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
 * The storefront's public origin, or `undefined` when it is not configured.
 *
 * For the places where a missing origin should cost a page its absolute URLs —
 * structured data, Open Graph — rather than its render. `serverEnv()` throws
 * on any invalid variable, which is right for the commerce client and too much
 * for a `<script type="application/ld+json">`.
 *
 * Read it at request time only. In a prerendered scope it captures the build's
 * value, which `build:ci` defaults to localhost — the fault robots.txt and the
 * sitemap already had once.
 */
export function storefrontOrigin(): string | undefined {
  const parsed = z.url().safeParse(process.env.STOREFRONT_URL);
  return parsed.success ? new URL(parsed.data).origin : undefined;
}

/**
 * The shop's WhatsApp number as `wa.me` wants it — digits, country code, no
 * plus — or `null` when there is none.
 *
 * Optional, and outside `envSchema` for the same reason as the HUB credentials:
 * a missing number must cost the page its WhatsApp button, not take the
 * storefront down. It is configuration rather than a constant because which
 * number is on WhatsApp is the owner's fact, and the plan moves the well-known
 * number to the WhatsApp API at a date not yet set.
 *
 * Public by nature (it ends up in a link), but still not `NEXT_PUBLIC_`: it is
 * only ever read on the server and passed down as a finished href.
 */
export function whatsappNumber(): string | null {
  const digits = (process.env.WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  // E.164 allows at most 15 digits; under 8 is not a phone number.
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
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

export function isHubStorefront(): boolean {
  return process.env.STOREFRONT_BACKEND === "hub";
}
