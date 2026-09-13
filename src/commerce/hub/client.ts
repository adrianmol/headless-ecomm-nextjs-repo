import "server-only";
import { createHmac } from "node:crypto";
import { hubConfig } from "@/lib/env";

/**
 * Signed transport for the HUB catalog API.
 *
 * `import 'server-only'` is load-bearing: the secret signs requests and an
 * accidental import from a Client Component would ship it to the browser. That
 * would be worse than a leaked read token, because the signature is the only
 * thing authenticating us.
 *
 * ## Signature
 *
 * `HMAC-SHA256(secret, METHOD \n PATH \n BODY \n TIMESTAMP)`, hex-encoded.
 * Verified against the live API on 2026-09-13: hex is accepted, base64 is not.
 *
 * `PATH` is the path **including the query string, exactly as sent**. This is the
 * one detail most likely to cause a mysterious `unauthorized`, and the contract
 * warns about it: recomposing the query from parts can reorder parameters, and
 * the signature then covers a different string than the one on the wire.
 *
 * The defence here is structural rather than careful: `signedFetch` builds the
 * URL once, extracts `pathname + search` from that same object, and never sees
 * the parameters again. There is no second code path that could serialise them
 * differently.
 *
 * ## Clock
 *
 * The window is 5 minutes. The contract notes that the usual cause of
 * `unauthorized` is the server clock rather than a wrong secret, so
 * `HubUnauthorizedError` says so — otherwise the next person spends an afternoon
 * regenerating a key that was never the problem.
 */

/** Deliberately bounded: a hung catalog must not hold a render open. */
const REQUEST_TIMEOUT_MS = 8000;

export type HubErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "server_error";

export class HubError extends Error {
  readonly code: HubErrorCode | "unconfigured" | "transport" | "malformed";
  readonly status?: number;

  constructor(
    code: HubError["code"],
    message: string,
    options?: { status?: number; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "HubError";
    this.code = code;
    this.status = options?.status;
  }
}

export class HubUnauthorizedError extends HubError {
  constructor(message: string) {
    super(
      "unauthorized",
      `${message}. Check the server clock before the credentials: the signing window is 5 minutes and skew presents as unauthorized.`,
      { status: 401 },
    );
    this.name = "HubUnauthorizedError";
  }
}

function signature(
  secret: string,
  method: string,
  path: string,
  body: string,
  timestamp: string,
): string {
  return createHmac("sha256", secret)
    .update([method, path, body, timestamp].join("\n"))
    .digest("hex");
}

/** `{ ok: true, data }` / `{ ok: false, error: { code, message } }`. */
type HubEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code?: string; message?: string } };

function isErrorCode(value: unknown): value is HubErrorCode {
  return (
    typeof value === "string" &&
    [
      "bad_request",
      "unauthorized",
      "forbidden",
      "not_found",
      "rate_limited",
      "server_error",
    ].includes(value)
  );
}

/**
 * Performs one signed request and unwraps the envelope.
 *
 * @param path Path beginning with `/`, query included. Pass it already encoded;
 * this function must not touch it, for the signing reason above.
 */
export async function hubFetch<T>(
  path: string,
  options: { method?: "GET" | "POST"; body?: string } = {},
): Promise<T> {
  const config = hubConfig();
  if (config.state !== "configured") {
    // Names the fields, never the values.
    throw new HubError(
      "unconfigured",
      `HUB API is ${config.state}: ${config.fields.join(", ")}`,
    );
  }

  const method = options.method ?? "GET";
  const body = options.body ?? "";
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Built once. `url.pathname + url.search` is by construction the same string
  // the request line will carry.
  const url = new URL(path, config.credentials.HUB_API_URL);
  const signedPath = `${url.pathname}${url.search}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        "X-Api-Key": config.credentials.HUB_API_KEY,
        "X-Timestamp": timestamp,
        "X-Signature": signature(
          config.credentials.HUB_API_SECRET,
          method,
          signedPath,
          body,
          timestamp,
        ),
        accept: "application/json",
        ...(body === "" ? {} : { "content-type": "application/json" }),
      },
      body: body === "" ? undefined : body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    // The upstream host is not disclosed in the message: this can surface in
    // logs, and the catalog API is not something a visitor needs to learn about.
    throw new HubError("transport", "HUB API unreachable", { cause });
  }

  let envelope: HubEnvelope<T>;
  try {
    envelope = (await response.json()) as HubEnvelope<T>;
  } catch (cause) {
    throw new HubError("malformed", "HUB API returned a non-JSON body", {
      status: response.status,
      cause,
    });
  }

  if (envelope.ok === true) return envelope.data;

  const code = isErrorCode(envelope.error?.code)
    ? envelope.error.code
    : "server_error";

  if (code === "unauthorized") {
    throw new HubUnauthorizedError("HUB API rejected the signature");
  }

  // The upstream `message` is deliberately dropped rather than propagated. It is
  // backend prose in Romanian, aimed at an integrator, and the rest of this
  // codebase already refuses to surface backend prose to the UI or the logs.
  throw new HubError(code, `HUB API returned ${code}`, {
    status: response.status,
  });
}
