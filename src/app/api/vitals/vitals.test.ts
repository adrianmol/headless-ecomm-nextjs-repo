import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const beacon = (metric: Record<string, unknown>) => JSON.stringify(metric);

/** Plain string body; undici sets an honest Content-Length. */
const post = (body: string) =>
  POST(new Request("http://localhost/api/vitals", { method: "POST", body }));

/**
 * Streams `chunkCount` chunks of `chunkBytes` each, counting how many were
 * actually pulled. That count is the assertion that matters for the size cap:
 * a route which buffers first would drain the whole stream.
 */
function streamingRequest(options: {
  chunkBytes: number;
  chunkCount: number;
  contentLength?: string;
}) {
  const pulls = { count: 0 };
  const chunk = new Uint8Array(options.chunkBytes).fill(0x61); // "a"

  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulls.count >= options.chunkCount) {
        controller.close();
        return;
      }
      pulls.count += 1;
      controller.enqueue(chunk);
    },
  });

  const headers = new Headers();
  if (options.contentLength !== undefined) {
    headers.set("content-length", options.contentLength);
  }

  const request = new Request("http://localhost/api/vitals", {
    method: "POST",
    body,
    headers,
    // Required by undici for a streaming request body.
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  return { request, pulls };
}

const logged = (log: ReturnType<typeof vi.spyOn>) =>
  JSON.parse(log.mock.calls[0][0] as string);

describe("web vitals endpoint", () => {
  it("logs a valid metric as a route template", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const response = await post(
      beacon({
        name: "LCP",
        value: 1234.5678,
        rating: "good",
        path: "/produse",
      }),
    );

    expect(response.status).toBe(204);
    expect(logged(log)).toEqual({
      event: "web_vital",
      name: "LCP",
      value: 1234.568,
      rating: "good",
      route: "/produse",
    });

    log.mockRestore();
  });

  it.each([
    ["not json", "{{{"],
    ["a JSON array", "[1,2,3]"],
    ["a JSON scalar", '"LCP"'],
    ["unknown metric name", beacon({ name: "MadeUpMetric", value: 1 })],
    ["missing value", beacon({ name: "LCP" })],
    ["non-numeric value", beacon({ name: "LCP", value: "fast" })],
    ["null value", beacon({ name: "LCP", value: null })],
    ["negative value", beacon({ name: "LCP", value: -1 })],
    ["implausibly large value", beacon({ name: "LCP", value: 3_600_001 })],
    ["an empty body", ""],
  ])("ignores %s without logging", async (_label, body) => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const response = await post(body);

    // Always 204: a malformed beacon is not the customer's problem, and this is
    // a public endpoint anyone can post to.
    expect(response.status).toBe(204);
    expect(log).not.toHaveBeenCalled();

    log.mockRestore();
  });
});

describe("body size cap", () => {
  it("stops reading an oversized stream instead of buffering it", async () => {
    // No Content-Length at all, so only the streaming limit can save us.
    // 64 chunks x 512 B = 32 KiB offered against a 1 KiB cap.
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { request, pulls } = streamingRequest({
      chunkBytes: 512,
      chunkCount: 64,
    });

    const response = await POST(request);

    expect(response.status).toBe(204);
    expect(log).not.toHaveBeenCalled();
    // Cancelled after crossing 1 KiB, not drained: 3 pulls, not 64.
    expect(pulls.count).toBeLessThanOrEqual(4);

    log.mockRestore();
  });

  it("rejects a body that lies about being small", async () => {
    // Declares 10 bytes and sends 32 KiB. Trusting Content-Length here would
    // read the whole thing.
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { request, pulls } = streamingRequest({
      chunkBytes: 512,
      chunkCount: 64,
      contentLength: "10",
    });

    const response = await POST(request);

    expect(response.status).toBe(204);
    expect(log).not.toHaveBeenCalled();
    expect(pulls.count).toBeLessThanOrEqual(4);

    log.mockRestore();
  });

  it("rejects an oversized declared Content-Length without reading the body", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { request, pulls } = streamingRequest({
      chunkBytes: 512,
      chunkCount: 64,
      contentLength: String(1024 * 1024),
    });

    // undici pulls one chunk of its own accord shortly after a streaming
    // Request is constructed, before any handler touches it. Baseline that
    // first, so this asserts what the route did rather than what the fetch
    // implementation did.
    await new Promise((resolve) => setTimeout(resolve, 10));
    const baseline = pulls.count;

    const response = await POST(request);

    expect(response.status).toBe(204);
    expect(log).not.toHaveBeenCalled();
    // Early rejection: the route consumed nothing and never locked the stream.
    expect(pulls.count).toBe(baseline);
    expect(request.bodyUsed).toBe(false);

    log.mockRestore();
  });

  it.each([
    ["a non-numeric Content-Length", "abc"],
    ["a negative Content-Length", "-1"],
  ])("rejects %s", async (_label, contentLength) => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { request } = streamingRequest({
      chunkBytes: 16,
      chunkCount: 1,
      contentLength,
    });

    expect((await POST(request)).status).toBe(204);
    expect(log).not.toHaveBeenCalled();

    log.mockRestore();
  });

  it("accepts a small streamed body with no Content-Length", async () => {
    // The cap must not reject legitimate beacons that arrive chunked.
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const payload = beacon({ name: "CLS", value: 0.01, path: "/cos" });

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      },
    });

    const request = new Request("http://localhost/api/vitals", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    expect((await POST(request)).status).toBe(204);
    expect(logged(log)).toMatchObject({ name: "CLS", route: "/cos" });

    log.mockRestore();
  });

  it("measures bytes rather than string length", async () => {
    // 400 four-byte characters is 1600 bytes but only 800 UTF-16 code units,
    // so a `text.length` check would wave it through.
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const response = await post(
      beacon({ name: "LCP", value: 1, padding: "𝔘".repeat(400) }),
    );

    expect(response.status).toBe(204);
    expect(log).not.toHaveBeenCalled();

    log.mockRestore();
  });
});

describe("path handling", () => {
  it.each([
    ["/", "/"],
    ["/produse", "/produse"],
    ["/cos", "/cos"],
    ["/finalizare-comanda", "/finalizare-comanda"],
    ["/finalizare-comanda/confirming", "/finalizare-comanda/confirming"],
    ["/produse/toner-compatibil-hp-35a-black-cb435a", "/produse/[slug]"],
    ["/categorii/tonere", "/categorii/[slug]"],
    ["/compatibil/brother", "/compatibil/[brand]"],
    ["/compatibil/brother/hl-2130", "/compatibil/[brand]/[model]"],
    ["/info/seap", "/info/seap"],
  ])("normalises %s to %s", async (path, expected) => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await post(beacon({ name: "LCP", value: 1, path }));

    expect(logged(log).route).toBe(expected);
    log.mockRestore();
  });

  it("drops the order reference from an order path", async () => {
    // An order reference in a log line is exactly the kind of identifier that
    // should not be sitting in stdout.
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await post(
      beacon({ name: "LCP", value: 1, path: "/comenzi/ord_9djpnlej" }),
    );

    const entry = logged(log);
    expect(entry.route).toBe("/comenzi/[id]");
    expect(JSON.stringify(entry)).not.toContain("ord_9djpnlej");

    log.mockRestore();
  });

  it.each([
    ["a query string", "/produse?token=secret123"],
    ["a fragment", "/produse#section"],
    ["userinfo credentials", "//user:pass@evil.test/produse"],
    ["an absolute URL", "https://evil.test/produse"],
    ["a protocol-relative URL", "//evil.test/produse"],
    ["path traversal", "/produse/../../etc/passwd"],
    ["an embedded newline", '/produse\n{"event":"forged"}'],
    ["a carriage return", "/produse\r\nX-Injected: 1"],
    ["a NUL byte", "/produse\u0000"],
    ["an ANSI escape sequence", "/produse\u001b[31mred"],
    ["percent-encoding", "/produse/%2e%2e%2f%2e%2e"],
    ["an email address", "/finalizare-comanda/shopper@example.test"],
    ["a very long path", `/produse/${"a".repeat(200)}`],
    ["an empty string", ""],
    ["a relative path", "products"],
  ])(
    "logs %s as the unknown route rather than the raw value",
    async (_label, path) => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});

      await post(beacon({ name: "LCP", value: 1, path }));

      const line = log.mock.calls[0][0] as string;
      expect(JSON.parse(line).route).toBe("other");
      // The whole log line must be free of the supplied value, not just the
      // route field — a forged newline must not be able to fake a log entry.
      expect(line).not.toContain("evil.test");
      expect(line).not.toContain("secret123");
      expect(line).not.toContain("passwd");
      expect(line).not.toContain("X-Injected");
      expect(line).not.toContain("shopper@example.test");

      log.mockRestore();
    },
  );

  it.each([
    ["a number", 42],
    ["an object", { toString: "nope" }],
    ["an array", ["/produse"]],
    ["null", null],
    ["undefined", undefined],
  ])("logs the unknown route when path is %s", async (_label, path) => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await post(beacon({ name: "LCP", value: 1, path }));

    expect(logged(log).route).toBe("other");
    log.mockRestore();
  });
});

describe("rating handling", () => {
  it.each([["good"], ["needs-improvement"], ["poor"]])(
    "keeps the known rating %s",
    async (rating) => {
      const log = vi.spyOn(console, "log").mockImplementation(() => {});

      await post(beacon({ name: "LCP", value: 1, rating }));

      expect(logged(log).rating).toBe(rating);
      log.mockRestore();
    },
  );

  it("discards an arbitrary rating string", async () => {
    // Same untrusted payload as everything else here; it was previously logged
    // verbatim.
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await post(
      beacon({ name: "LCP", value: 1, rating: 'good","injected":"yes' }),
    );

    const line = log.mock.calls[0][0] as string;
    expect(JSON.parse(line).rating).toBeUndefined();
    expect(line).not.toContain("injected");

    log.mockRestore();
  });
});
