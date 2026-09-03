// Minimal stand-in for `next/headers`, which requires a Next.js request scope.
// Aliased in vitest.config.ts so the data layer can be tested as plain code.

const store = new Map<string, string>();

export function __setCookie(name: string, value: string): void {
  store.set(name, value);
}

export function __resetCookies(): void {
  store.clear();
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
