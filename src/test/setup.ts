import { afterAll, afterEach, beforeAll } from "vitest";
import { setupServer } from "msw/node";
import { API_BASE, handlers, idempotencyLog } from "@/mocks/handlers";
import { resetCommerceClientCache } from "@/commerce/client";
import { resetServerEnvCache } from "@/lib/env";
import { __resetCookies } from "./stubs/next-headers";
import { resetCacheStub } from "./stubs/next-cache";

process.env.COMMERCE_API_URL = API_BASE;

export const server = setupServer(...handlers);

beforeAll(() => {
  // Any request the mocks do not describe is a bug in the test, not something
  // to silently pass through to the network.
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  server.resetHandlers();
  idempotencyLog.length = 0;
  __resetCookies();
  resetCacheStub();
  resetCommerceClientCache();
  resetServerEnvCache();
});

afterAll(() => {
  server.close();
});
