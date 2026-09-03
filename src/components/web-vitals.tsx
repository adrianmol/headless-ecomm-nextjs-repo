"use client";

import { useReportWebVitals } from "next/web-vitals";

/**
 * Field Core Web Vitals (architecture §8).
 *
 * Lab numbers from Lighthouse in CI catch regressions before merge; they do not
 * tell you what real customers on real devices experience, which is what the
 * LCP and CLS budgets are ultimately about. This reports the field metric.
 *
 * Defined at module scope on purpose. Next calls a *new* callback with every
 * metric collected up to that point, so an inline arrow would re-report the
 * same metrics on each render.
 *
 * `sendBeacon` rather than `fetch`: the interesting metrics (LCP, CLS, INP) are
 * only final as the page is being unloaded, and a normal request at that moment
 * is routinely cancelled. Beacons survive it.
 */
function report(metric: { name: string; value: number; id: string; rating?: string }) {
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    id: metric.id,
    path: window.location.pathname,
  });

  if (typeof navigator.sendBeacon === "function") {
    navigator.sendBeacon("/api/vitals", body);
    return;
  }

  // Safari < 16.4 and friends. keepalive gives the request a chance to outlive
  // the page; failure here is not worth surfacing to the customer.
  void fetch("/api/vitals", {
    method: "POST",
    body,
    keepalive: true,
    headers: { "content-type": "application/json" },
  }).catch(() => {});
}

/** Renders nothing. Mounted once in the root layout. */
export function WebVitals() {
  useReportWebVitals(report);
  return null;
}
