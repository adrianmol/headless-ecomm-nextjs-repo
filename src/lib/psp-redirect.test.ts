import { afterEach, describe, expect, it } from "vitest";
import { checkPspRedirect } from "./psp-redirect";

afterEach(() => {
  delete process.env.PSP_ALLOWED_HOSTS;
});

describe("checkPspRedirect", () => {
  it("accepts https to any host", () => {
    const result = checkPspRedirect("https://pay.provider.example/session/abc");
    expect(result).toMatchObject({ ok: true, host: "pay.provider.example" });
  });

  it("accepts http on loopback, which is how the mock provider is reached", () => {
    // The e2e suite runs against a production build and the mock answers on
    // 127.0.0.1, so this case has to work or the rule gets switched off in the
    // one build that matters.
    for (const host of ["127.0.0.1:4010", "localhost:4010", "[::1]:4010"]) {
      expect(checkPspRedirect(`http://${host}/psp/pay?ref=x`).ok).toBe(true);
    }
  });

  it("rejects http to a real host", () => {
    // The actual risk: a downgraded provider URL, where card details would be
    // typed over plaintext.
    expect(checkPspRedirect("http://pay.provider.example/x")).toMatchObject({
      ok: false,
      reason: "insecure_scheme",
      host: "pay.provider.example",
    });
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<h1>pay</h1>",
    "file:///etc/passwd",
  ])("rejects %s by naming the scheme", (value) => {
    const result = checkPspRedirect(value);
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toMatch(/^scheme_/);
  });

  it("rejects credentials in the URL, which cloak the real host", () => {
    // A reader skimming the address bar sees the provider; the actual host is
    // evil.test.
    expect(
      checkPspRedirect("https://pay.provider.example@evil.test/pay"),
    ).toMatchObject({
      ok: false,
      reason: "credentials_in_url",
      host: "evil.test",
    });
  });

  it("rejects a relative path rather than treating it as convenience", () => {
    // A payment page served by us is not a payment page; accepting one would
    // hide a backend misconfiguration.
    expect(checkPspRedirect("/psp/pay")).toMatchObject({
      ok: false,
      reason: "unparseable",
    });
  });

  it.each([
    ["an empty string", ""],
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["an object", { url: "https://x.test" }],
  ])("rejects %s", (_label, value) => {
    expect(checkPspRedirect(value)).toMatchObject({
      ok: false,
      reason: "missing",
    });
  });

  describe("with PSP_ALLOWED_HOSTS configured", () => {
    it("accepts a listed host", () => {
      process.env.PSP_ALLOWED_HOSTS = "pay.provider.example, other.example";
      expect(checkPspRedirect("https://pay.provider.example/x").ok).toBe(true);
      expect(checkPspRedirect("https://other.example/x").ok).toBe(true);
    });

    it("rejects an unlisted host even over https", () => {
      process.env.PSP_ALLOWED_HOSTS = "pay.provider.example";
      expect(checkPspRedirect("https://evil.test/x")).toMatchObject({
        ok: false,
        reason: "host_not_allowed",
        host: "evil.test",
      });
    });

    it("is case-insensitive about the host", () => {
      process.env.PSP_ALLOWED_HOSTS = "Pay.Provider.Example";
      expect(checkPspRedirect("https://PAY.provider.EXAMPLE/x").ok).toBe(true);
    });

    it("does nothing when unset, rather than rejecting everything", () => {
      // The real provider is not chosen yet. An allowlist that defaulted to
      // empty-means-deny would make checkout unusable until a value existed.
      expect(checkPspRedirect("https://anything.example/x").ok).toBe(true);
    });
  });
});
