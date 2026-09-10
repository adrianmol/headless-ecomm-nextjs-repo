import { defineConfig, devices } from "@playwright/test";

const PORT = 3101;
const MOCK_PORT = 4021;

export const BASE_URL = `http://localhost:${PORT}`;
export const MOCK_API_URL = `http://127.0.0.1:${MOCK_PORT}`;

/**
 * Deterministic public origin used for SEO metadata assertions. The app is still
 * served from `BASE_URL`; this origin lets E2E prove that canonical URLs, Open
 * Graph, and Twitter card URLs come from `STOREFRONT_URL`, not the test server.
 */
export const STOREFRONT_URL = "https://storefront.test";

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
    url: `${BASE_URL}/produse`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // The standalone server takes its port from the environment, not a flag.
      PORT: String(PORT),
      MOCK_API_PORT: String(MOCK_PORT),
      // The public storefront origin: used for canonical/OG/Twitter metadata.
      // A non-local value proves URLs are built from config, not the test server.
      STOREFRONT_URL: STOREFRONT_URL,
      // The mock PSP must send the browser back to the actual test server,
      // not to the configured public origin.
      MOCK_PSP_RETURN_ORIGIN: BASE_URL,
      // Short enough to keep tests quick, long enough that returning
      // immediately still lands on the pending path.
      MOCK_PENDING_MS: "2500",
    },
  },
});
