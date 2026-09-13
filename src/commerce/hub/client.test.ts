import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { http, HttpResponse } from "msw";
import { server } from "@/test/setup";
import { resetHubConfigCache } from "@/lib/env";
import { HubError, hubFetch } from "./client";

const BASE = "https://hub.test";
const KEY = "hk_testkey0000";
const SECRET = "s".repeat(64);

type Captured = {
  method: string;
  url: string;
  key: string | null;
  timestamp: string | null;
  signature: string | null;
};

let captured: Captured | null = null;

function capture(body: Record<string, unknown>, status = 200) {
  server.use(
    http.all(`${BASE}/*`, async ({ request }) => {
      captured = {
        method: request.method,
        url: request.url,
        key: request.headers.get("x-api-key"),
        timestamp: request.headers.get("x-timestamp"),
        signature: request.headers.get("x-signature"),
      };
      return HttpResponse.json(body, { status });
    }),
  );
}

/** The formula, restated independently of the implementation. */
function expectedSignature(
  method: string,
  path: string,
  requestBody: string,
  timestamp: string,
) {
  return createHmac("sha256", SECRET)
    .update([method, path, requestBody, timestamp].join("\n"))
    .digest("hex");
}

beforeEach(() => {
  captured = null;
  resetHubConfigCache();
  process.env.HUB_API_URL = BASE;
  process.env.HUB_API_KEY = KEY;
  process.env.HUB_API_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.HUB_API_URL;
  delete process.env.HUB_API_KEY;
  delete process.env.HUB_API_SECRET;
  resetHubConfigCache();
});

describe("hubFetch signing", () => {
  it("signs METHOD, PATH, BODY and TIMESTAMP with hex HMAC-SHA256", async () => {
    capture({ ok: true, data: { value: 1 } });

    await hubFetch("/hub-api/v1/category");

    expect(captured?.key).toBe(KEY);
    expect(captured?.signature).toBe(
      expectedSignature(
        "GET",
        "/hub-api/v1/category",
        "",
        captured!.timestamp!,
      ),
    );
  });

  it("signs the query string exactly as sent, in the order sent", async () => {
    // The contract's sharpest warning: the path enters the signature with its
    // query, so recomposing it from parts can reorder parameters and the
    // signature then covers a different string than the wire does.
    capture({ ok: true, data: {} });

    const path = "/hub-api/v1/category/1727?adanc=1&pe_pagina=2";
    await hubFetch(path);

    expect(new URL(captured!.url).search).toBe("?adanc=1&pe_pagina=2");
    expect(captured?.signature).toBe(
      expectedSignature("GET", path, "", captured!.timestamp!),
    );
  });

  it("does not reorder or re-encode a query it was handed", async () => {
    // Deliberately non-alphabetical, and with an encoded comma.
    capture({ ok: true, data: {} });

    const path = "/hub-api/v1/live?skus=B%2CA&ids=2,1";
    await hubFetch(path);

    const sent = new URL(captured!.url);
    expect(`${sent.pathname}${sent.search}`).toBe(path);
    expect(captured?.signature).toBe(
      expectedSignature("GET", path, "", captured!.timestamp!),
    );
  });

  it("sends a unix-second timestamp inside the signing window", async () => {
    capture({ ok: true, data: {} });

    await hubFetch("/hub-api/v1/category");

    const sent = Number(captured!.timestamp);
    expect(Number.isInteger(sent)).toBe(true);
    // Seconds, not milliseconds — a ms value would be ~1000x out and always
    // land outside the 5 minute window.
    expect(Math.abs(sent - Math.floor(Date.now() / 1000))).toBeLessThan(5);
  });

  it("includes the body in the signature for a POST", async () => {
    capture({ ok: true, data: {} });

    await hubFetch("/hub-api/v1/thing", { method: "POST", body: '{"a":1}' });

    expect(captured?.signature).toBe(
      expectedSignature(
        "POST",
        "/hub-api/v1/thing",
        '{"a":1}',
        captured!.timestamp!,
      ),
    );
  });
});

describe("hubFetch envelope and errors", () => {
  it("unwraps ok:true to data", async () => {
    capture({ ok: true, data: { categories: [{ id: 1 }] } });
    await expect(hubFetch("/hub-api/v1/category")).resolves.toEqual({
      categories: [{ id: 1 }],
    });
  });

  it("normalises Romanian field names to the canonical English ones", async () => {
    // The API served Romanian names in the morning of 2026-09-13 and English ones
    // hours later, so both have to parse. Everything below this boundary is
    // written against one spelling because of this step.
    capture({
      ok: true,
      data: {
        categorii: [{ id: 1, parinte: 0, nume: "Brother", fel: "brand" }],
      },
    });

    await expect(hubFetch("/hub-api/v1/category")).resolves.toEqual({
      categories: [{ id: 1, parent: 0, name: "Brother", kind: "brand" }],
    });
  });

  it("prefers the English key when a payload somehow carries both", async () => {
    // Otherwise key order would decide, which is not a decision anyone made.
    capture({ ok: true, data: { nume: "romanian", name: "english" } });
    await expect(hubFetch("/x")).resolves.toEqual({ name: "english" });
  });

  it.each([
    ["bad_request", 400],
    ["forbidden", 403],
    ["not_found", 404],
    ["rate_limited", 429],
    ["server_error", 500],
  ])("maps %s to a HubError carrying the code", async (code, status) => {
    capture({ ok: false, error: { code, message: "prose" } }, status);

    await expect(hubFetch("/x")).rejects.toMatchObject({
      name: "HubError",
      code,
    });
  });

  it("never propagates the upstream message", async () => {
    // Backend prose, in Romanian, aimed at an integrator. The rest of this
    // codebase refuses to surface it, and so does this.
    capture(
      {
        ok: false,
        error: { code: "not_found", message: "Categoria 5431 nu exista." },
      },
      404,
    );

    await expect(hubFetch("/x")).rejects.toThrow(
      /^HUB API returned not_found$/,
    );
  });

  it("points at the clock on unauthorized, because that is usually the cause", async () => {
    capture({ ok: false, error: { code: "unauthorized" } }, 401);

    await expect(hubFetch("/x")).rejects.toThrow(/server clock/i);
  });

  it("treats an unrecognised error code as a server error rather than trusting it", async () => {
    capture({ ok: false, error: { code: "something_new" } }, 500);

    await expect(hubFetch("/x")).rejects.toMatchObject({
      code: "server_error",
    });
  });

  it("rejects a non-JSON body as malformed", async () => {
    server.use(
      http.all(
        `${BASE}/*`,
        () => new HttpResponse("<html>502</html>", { status: 502 }),
      ),
    );

    await expect(hubFetch("/x")).rejects.toMatchObject({ code: "malformed" });
  });

  it("reports a transport failure without naming the upstream host", async () => {
    server.use(http.all(`${BASE}/*`, () => HttpResponse.error()));

    const error = await hubFetch("/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HubError);
    expect((error as HubError).code).toBe("transport");
    expect((error as HubError).message).not.toContain("hub.test");
  });
});

describe("hubFetch configuration", () => {
  it("reports which fields are missing, never their values", async () => {
    delete process.env.HUB_API_SECRET;
    resetHubConfigCache();

    const error = await hubFetch("/x").catch((e: unknown) => e);
    expect((error as HubError).code).toBe("unconfigured");
    expect((error as HubError).message).toContain("HUB_API_SECRET");
    expect((error as HubError).message).not.toContain(SECRET);
  });

  it("refuses a secret too short to be a real one", async () => {
    process.env.HUB_API_SECRET = "tooshort";
    resetHubConfigCache();

    const error = await hubFetch("/x").catch((e: unknown) => e);
    expect((error as HubError).code).toBe("unconfigured");
    expect((error as HubError).message).toContain("invalid");
  });
});
