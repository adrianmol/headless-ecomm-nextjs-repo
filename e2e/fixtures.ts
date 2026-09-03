import { test as base, expect } from "@playwright/test";
import { MOCK_API_URL } from "../playwright.config";

/**
 * Resets the mock backend before every test.
 *
 * The mock keeps one global cart and caches idempotency keys, and the keys the
 * client derives from `useId` can repeat across tests. Without this, a basket
 * from one test silently becomes the starting state of the next.
 */
export const test = base.extend({
  page: async ({ page, request }, use) => {
    const response = await request.post(`${MOCK_API_URL}/__reset`);
    expect(response.ok(), "mock backend reset failed").toBe(true);
    await use(page);
  },
});

export { expect };
