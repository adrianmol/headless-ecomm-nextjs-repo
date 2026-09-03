import { defineConfig, devices } from "@playwright/test";

const PORT = 3101;
const MOCK_PORT = 4021;

export const BASE_URL = `http://localhost:${PORT}`;
export const MOCK_API_URL = `http://127.0.0.1:${MOCK_PORT}`;

/**
 * E2E runs against a production build, not `next dev`.
 *
 * Partial prerendering, cache lifetimes and streaming all behave differently in
 * development, and those are precisely the behaviours these tests assert.
 *
 * Specifically it runs the *standalone* server — `node .next/standalone/server.js`,
 * via start:ci — because that is what the container executes. `next start` is
 * both unsupported alongside `output: 'standalone'` and not what we deploy, so
 * testing it would mean exercising a server that never reaches production.
 *
 * Requires `pnpm build:ci` first: the build needs a reachable API because
 * `use cache` scopes are prerendered.
 */
export default defineConfig({
  testDir: "./e2e",

  // The mock holds a single global cart, so parallel tests would fight over it.
  // Isolation comes from POST /__reset in a fixture, which only works serially.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    command: "pnpm start:ci",
    url: `${BASE_URL}/products`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // The standalone server takes its port from the environment, not a flag.
      PORT: String(PORT),
      MOCK_API_PORT: String(MOCK_PORT),
      // The stand-in payment page must send the shopper back to this server.
      STOREFRONT_URL: BASE_URL,
      // Short enough to keep tests quick, long enough that returning
      // immediately still lands on the pending path.
      MOCK_PENDING_MS: "2500",
    },
  },
});
