import { afterEach, describe, expect, it } from "vitest";
import { __resetHeaders, __setHeaders } from "@/test/stubs/next-headers";
import { isSameOrigin } from "./request-origin";

afterEach(() => {
  __resetHeaders();
});

describe("isSameOrigin", () => {
  it("accepts a matching origin", async () => {
    __setHeaders({ origin: "https://shop.test", host: "shop.test" });
    expect(await isSameOrigin()).toBe(true);
  });

  it("accepts a match against x-forwarded-host ahead of host", async () => {
    // The deployment terminates TLS in a reverse proxy and publishes to
    // 127.0.0.1:PORT, so `host` is the internal address while Origin carries the
    // public one. Without this the check would reject every real request.
    __setHeaders({
      origin: "https://shop.test",
      host: "127.0.0.1:3000",
      "x-forwarded-host": "shop.test",
    });
    expect(await isSameOrigin()).toBe(true);
  });

  it.each([
    ["a foreign origin", { origin: "https://evil.test", host: "shop.test" }],
    [
      "the same host on another port",
      { origin: "https://shop.test:8443", host: "shop.test" },
    ],
    ["a subdomain", { origin: "https://evil.shop.test", host: "shop.test" }],
    [
      "a host suffix trick",
      { origin: "https://shop.test.evil.test", host: "shop.test" },
    ],
    ["an unparseable origin", { origin: "not-a-url", host: "shop.test" }],
  ])("rejects %s", async (_label, headers) => {
    __setHeaders(headers);
    expect(await isSameOrigin()).toBe(false);
  });

  it("rejects an absent Origin rather than treating it as trusted", async () => {
    // This is the whole reason the helper exists. Next allows an absent Origin
    // and executes the action; measured against the production build, a replayed
    // checkout with no Origin created an order. An intermediary that strips the
    // header would silently disable the framework's protection.
    __setHeaders({ host: "shop.test" });
    expect(await isSameOrigin()).toBe(false);
  });

  it("rejects the literal string null", async () => {
    // Sent by some privacy modes and by sandboxed iframes.
    __setHeaders({ origin: "null", host: "shop.test" });
    expect(await isSameOrigin()).toBe(false);
  });

  it("rejects when there is no host to compare against", async () => {
    __setHeaders({ origin: "https://shop.test" });
    expect(await isSameOrigin()).toBe(false);
  });

  it("rejects when the request carries no headers at all", async () => {
    __setHeaders(null);
    expect(await isSameOrigin()).toBe(false);
  });
});
