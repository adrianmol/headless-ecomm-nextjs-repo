# ADR-0001: Next.js is a BFF, not just a renderer

- **Status:** Accepted
- **Date:** 2026-09-03
- **Deciders:** Frontend architecture

## Context

The storefront is backed by a custom internal REST API that owns the cart and issues the user session
cookie. Two topologies were available.

## Decision

The browser talks **only** to the Next.js origin. Next.js forwards requests server-side to the
internal commerce API over a private network. The internal API is not internet-facing.

## Alternatives considered

**A. Browser calls the internal API directly, Next.js only renders.**
Rejected. It requires the internal API to be internet-facing with a public edge and CORS
configuration, forces the session cookie to be third-party or to share a cookie domain, moves API
logic into the client bundle, and turns every internal API change into a public API change requiring a
deprecation cycle.

**B. Browser -> Next.js -> internal API.** Chosen.

## Consequences

Positive:

- The internal API needs no public edge; attack surface shrinks to one origin.
- The session cookie is first-party and `httpOnly`, so it survives browser privacy changes and
  third-party cookie deprecation.
- The API contract stays internal and can evolve without deprecation cycles.
- Server Components can hold credentials the client must never see, which is what makes RSC pay off
  here rather than being incidental.

Negative / accepted costs:

- One extra network hop. The internal API therefore needs an explicit latency budget
  (see architecture doc §9), because frontend work cannot compensate for a slow backend.
- Next.js becomes latency-critical, revenue-critical infrastructure and must be operated accordingly:
  autoscaling, health checks, real observability.
- Payment webhooks must terminate at the backend, never at Next.js, so that order fulfilment does not
  depend on frontend availability.

## Reversibility

Low. Reversing this changes the security model, cookie strategy, deployment topology, and the public
surface of the internal API simultaneously. This is the most expensive decision in the project to
revisit, which is why it is recorded first.
