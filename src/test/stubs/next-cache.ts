// `cacheLife` and `cacheTag` only work inside a Next.js `use cache` scope and
// throw in plain Node. Aliased in vitest.config.mts.
//
// The stub records rather than silently no-ops: a tag string that differs
// between the read path and the revalidation path fails silently in production
// (the cache simply never invalidates), so it is worth asserting in tests.

export const appliedTags: string[] = [];
export const appliedLifetimes: unknown[] = [];
export const revalidatedTags: string[] = [];

export function cacheTag(...tags: string[]): void {
  appliedTags.push(...tags);
}

export function cacheLife(profile: unknown): void {
  appliedLifetimes.push(profile);
}

export function revalidateTag(tag: string): void {
  revalidatedTags.push(tag);
}

export let refreshCount = 0;

/** Server-Action-only in Next, so it throws outside a request here too. */
export function refresh(): void {
  refreshCount += 1;
}

export function resetCacheStub(): void {
  appliedTags.length = 0;
  appliedLifetimes.length = 0;
  revalidatedTags.length = 0;
  refreshCount = 0;
}
