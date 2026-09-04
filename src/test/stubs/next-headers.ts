// Minimal stand-in for `next/headers`, which requires a Next.js request scope.
// Aliased in vitest.config.ts so the data layer can be tested as plain code.

const store = new Map<string, string>();

/**
 * Request headers.
 *
 * Defaults to a valid same-origin pair, because that is the ordinary case and
 * every existing data-layer test is written against it — a mutation now refuses
 * to run unless it can prove the request came from this origin
 * (src/lib/request-origin.ts). Tests that care about that check set their own
 * values with `__setHeaders`.
 */
const DEFAULT_HEADERS: Record<string, string> = {
  origin: "https://storefront.test",
  host: "storefront.test",
};

let headerStore = new Map(Object.entries(DEFAULT_HEADERS));

export function __setCookie(name: string, value: string): void {
  store.set(name, value);
}

export function __resetCookies(): void {
  store.clear();
}

/** Replaces the request headers outright. `null` clears them entirely. */
export function __setHeaders(next: Record<string, string> | null): void {
  headerStore = new Map(Object.entries(next ?? {}));
}

export function __resetHeaders(): void {
  headerStore = new Map(Object.entries(DEFAULT_HEADERS));
}

export async function headers() {
  return {
    get(name: string) {
      return headerStore.get(name.toLowerCase()) ?? null;
    },
  };
}

export async function cookies() {
  return {
    get(name: string) {
      const value = store.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(name: string, value: string) {
      store.set(name, value);
    },
    delete(name: string) {
      store.delete(name);
    },
  };
}
