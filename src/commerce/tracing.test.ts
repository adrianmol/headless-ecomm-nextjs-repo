import { afterEach, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { propagation, type TextMapPropagator } from "@opentelemetry/api";
import { server } from "@/test/setup";
import { API_BASE, offerFixture } from "@/mocks/handlers";
import { getOffer } from "./catalog/queries";

/**
 * The middleware hands a `Headers` object to the propagator through a custom
 * carrier setter. That adapter is the part that can silently break — a wrong
 * setter means no `traceparent`, which means a slow page cannot be attributed
 * to rendering or to the upstream API, which is the entire reason tracing is
 * here (architecture §8).
 *
 * A stub propagator rather than the real W3C one: this asserts our wiring, not
 * OpenTelemetry's spec compliance.
 */
const stubPropagator: TextMapPropagator = {
  inject(_ctx, carrier, setter) {
    setter.set(carrier, "traceparent", "00-abc-def-01");
  },
  extract: (ctx) => ctx,
  fields: () => ["traceparent"],
};

afterEach(() => {
  propagation.disable();
});

describe("trace context propagation", () => {
  it("injects traceparent into outbound commerce requests", async () => {
    propagation.setGlobalPropagator(stubPropagator);
    let seen: string | null = null;

    server.use(
      http.get(`${API_BASE}/products/:slug/offer`, ({ request }) => {
        seen = request.headers.get("traceparent");
        return HttpResponse.json(offerFixture);
      }),
    );

    await getOffer("merino-crew");
    expect(seen).toBe("00-abc-def-01");
  });

  it("adds no header when no provider is registered", async () => {
    // Nothing is configured in development or in tests, and the request must
    // still work — instrumentation is opt-in via OTEL_EXPORTER_OTLP_ENDPOINT.
    let seen: string | null = "unset";

    server.use(
      http.get(`${API_BASE}/products/:slug/offer`, ({ request }) => {
        seen = request.headers.get("traceparent");
        return HttpResponse.json(offerFixture);
      }),
    );

    await expect(getOffer("merino-crew")).resolves.toEqual(offerFixture);
    expect(seen).toBeNull();
  });
});
