import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestError, register } from "./instrumentation";

afterEach(() => {
  vi.restoreAllMocks();
});

function logOf(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls[0][0] as string;
}

async function report(path: string) {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  await onRequestError(
    Object.assign(new Error("upstream said something internal"), {
      digest: "123456",
      name: "CommerceErrorException",
    }),
    { path, method: "GET" },
    { routePath: "/produse/[slug]", routeType: "render" },
  );
  return { line: logOf(spy), parsed: JSON.parse(logOf(spy)) };
}

/**
 * Next hands this hook the full resource path *including* the query string.
 * Measured before the fix: erroring on
 * `/produse/force-error?session_token=SEKRET123&email=shopper@example.test`
 * logged the token and the email verbatim into container logs.
 */
describe("onRequestError", () => {
  it("strips the query string from the logged path", async () => {
    const { line, parsed } = await report(
      "/produse/force-error?session_token=SEKRET123&email=shopper%40example.test",
    );

    expect(parsed.path).toBe("/produse/force-error");
    expect(line).not.toContain("SEKRET123");
    expect(line).not.toContain("session_token");
    expect(line).not.toContain("example.test");
  });

  it("strips a PSP return query, which carries the order reference and status", async () => {
    // The sharpest case: this handler's query string comes from the payment
    // provider and names an order.
    const { line, parsed } = await report(
      "/checkout/return?ref=ord_9djpnlej&status=success&amount=8900",
    );

    expect(parsed.path).toBe("/checkout/return");
    expect(line).not.toContain("ord_9djpnlej");
    expect(line).not.toContain("status=success");
  });

  it("strips a fragment as well", async () => {
    const { parsed } = await report("/produse/toner#content");
    expect(parsed.path).toBe("/produse/toner");
  });

  it("removes control characters so a path cannot forge a second log line", async () => {
    const { line, parsed } = await report(
      '/produse/x\n{"event":"request_error","kind":"forged"}',
    );

    // The property that matters is that one request cannot become two log
    // entries. The injected text does survive inside the `path` *value* — and
    // that is fine, because JSON.stringify escapes the quotes so it cannot break
    // out of the string. Asserting the word is absent would be over-specified;
    // asserting the structure is what protects the log.
    expect(parsed.path).not.toContain("\n");
    expect(line.split("\n")).toHaveLength(1);

    // One entry, and it is ours: the forged `kind` did not become the real one.
    expect(JSON.parse(line).kind).toBe("CommerceErrorException");
    expect(JSON.parse(line).event).toBe("request_error");
  });

  it("bounds the path so it cannot flood the log ring buffer", async () => {
    const { parsed } = await report(`/produse/${"a".repeat(5000)}`);
    expect(parsed.path.length).toBeLessThanOrEqual(257);
  });

  it("still logs what makes an error actionable", async () => {
    const { parsed } = await report("/produse/force-error?x=1");

    expect(parsed).toMatchObject({
      event: "request_error",
      kind: "CommerceErrorException",
      digest: "123456",
      method: "GET",
      path: "/produse/force-error",
      routePath: "/produse/[slug]",
      routeType: "render",
    });
  });

  it("never logs the error message, only the digest", async () => {
    // In production Next replaces the message with a digest anyway, and backend
    // prose may name internal fields.
    const { line } = await report("/produse/x");
    expect(line).not.toContain("upstream said something internal");
  });

  it("tolerates a missing path", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await onRequestError(new Error("boom"), {}, {});
    expect(JSON.parse(logOf(spy))).not.toHaveProperty("path");
  });
});

describe("register", () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it("warns when COMMERCE_API_URL and HUB_API_URL share a host", async () => {
    /*
      They are two different APIs. HUB serves /hub-api/v1/* and does not answer
      /products, /offers or /compat/brands, so pointing the provisional client at it
      makes ten routes 404 while three keep working — an empty page rather than an
      error. This warning exists because that cost an afternoon.
    */
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.COMMERCE_API_URL = "https://hub.reprint.ro";
    process.env.HUB_API_URL = "https://hub.reprint.ro";

    register();

    const line = warn.mock.calls[0]?.[0] as string;
    expect(JSON.parse(line).event).toBe("commerce_api_url_points_at_hub");
  });

  it("stays quiet when they are different hosts", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.COMMERCE_API_URL = "https://commerce.internal/v1";
    process.env.HUB_API_URL = "https://hub.reprint.ro";

    register();

    expect(warn).not.toHaveBeenCalled();
  });

  it("stays quiet when only one is configured", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.COMMERCE_API_URL = "https://hub.reprint.ro";
    delete process.env.HUB_API_URL;

    register();

    expect(warn).not.toHaveBeenCalled();
  });

  it("ignores a malformed URL, which is the env schema's problem", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.COMMERCE_API_URL = "not-a-url";
    process.env.HUB_API_URL = "https://hub.reprint.ro";

    expect(() => register()).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });
});
