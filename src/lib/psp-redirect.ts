/**
 * Validates the payment provider's redirect target before we send a customer to
 * it.
 *
 * ## Why this exists
 *
 * `startCheckoutAction` ends with `redirect(session.data.redirectUrl)` — the one
 * absolute, off-origin redirect in the storefront. Every other `redirect()` call
 * takes a relative path and cannot leave the origin.
 *
 * The URL comes from our own backend, so this is defence in depth rather than
 * distrust. It is worth having anyway because of *where* it sits: the customer is
 * one click from a page where they expect to type card details. An open redirect
 * anywhere is a phishing aid; an open redirect on the checkout button is a
 * phishing aid with the victim already primed. If a backend bug ever let a
 * client-supplied value reach `redirectUrl`, this is the difference between a
 * logged rejection and a credible card-harvesting page.
 *
 * ## The rule
 *
 * `https` to any host, or `http` **only** to loopback.
 *
 * Not "https in production, anything in development": the storefront's own e2e
 * suite runs against a production build with `NODE_ENV=production`, and the mock
 * provider answers on `http://127.0.0.1`. A rule keyed on the environment would
 * therefore either break the suite or be switched off in the one build that
 * matters. Keying on loopback instead is sound on its own terms — a real payment
 * provider is never on loopback, and a loopback address cannot be reached by an
 * attacker who is not already on the host.
 *
 * An optional host allowlist tightens this further when `PSP_ALLOWED_HOSTS` is
 * set. It is unset here because the real provider is not yet chosen; the code is
 * ready for the value rather than inventing one.
 */

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

export type PspRedirectCheck =
  | { ok: true; url: string; host: string }
  /** `host` is absent when the value could not be parsed as a URL at all. */
  | { ok: false; reason: string; host?: string };

function allowedHosts(): readonly string[] {
  const raw = process.env.PSP_ALLOWED_HOSTS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function checkPspRedirect(value: unknown): PspRedirectCheck {
  if (typeof value !== "string" || value.length === 0) {
    return { ok: false, reason: "missing" };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // A relative path would land here. That is a rejection rather than a
    // convenience: a relative "payment page" served by us is not a payment page,
    // and silently accepting one would hide a backend misconfiguration.
    return { ok: false, reason: "unparseable" };
  }

  const host = url.hostname.toLowerCase();

  // Checked before the scheme so `javascript:` and `data:` — which have no host
  // and would otherwise produce a confusing "not https" reason — are named for
  // what they are.
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return {
      ok: false,
      reason: `scheme_${url.protocol.replace(":", "")}`,
      host,
    };
  }

  if (url.protocol === "http:" && !LOOPBACK_HOSTNAMES.has(host)) {
    return { ok: false, reason: "insecure_scheme", host };
  }

  const allow = allowedHosts();
  if (allow.length > 0 && !allow.includes(host)) {
    return { ok: false, reason: "host_not_allowed", host };
  }

  // Credentials in the URL are a redirect-cloaking trick: the browser shows
  // `https://provider.example@evil.test/` as belonging to the provider to a
  // reader skimming the address bar, while the actual host is the last one.
  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "credentials_in_url", host };
  }

  return { ok: true, url: url.toString(), host };
}
