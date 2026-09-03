# ADR-0003: Selective runtime validation at the API boundary

- **Status:** Accepted
- **Date:** 2026-09-03
- **Deciders:** Frontend architecture

## Context

Types are generated from the backend's OpenAPI spec with `openapi-typescript`. Generated types are a
compile-time _claim_ about backend behaviour. They provide no runtime guarantee: if the API returns
`null` for a field the spec marks required, TypeScript is silent and the failure surfaces as a render
crash or, worse, a wrong number on screen.

## Decision

Apply Zod validation at the API boundary **selectively**, on data where being silently wrong is
materially harmful:

- money and totals
- inventory and availability
- order and payment state
- anything used in a pricing or eligibility decision

Do **not** validate the full catalog payload. Descriptions, marketing copy, image alt text and similar
fields pass through with generated types only.

## Alternatives considered

**Validate everything.** Rejected. It imposes real per-request CPU cost on the hottest read paths for
marginal benefit on fields whose failure mode is cosmetic. In practice blanket validation gets disabled
under load pressure, which loses the protection on the fields that mattered.

**Validate nothing, trust the spec.** Rejected. The failure mode is charging the wrong amount.

## Consequences

- Validation effort concentrates where the blast radius is financial.
- Requires an explicit convention so the boundary does not drift: schemas live beside their fetchers in
  `src/commerce/<domain>/schemas.ts`, and a validation failure raises a normalised `Unavailable` domain
  error rather than a raw Zod error.
- Reviewers need a rule to apply. Encoded in the `commerce-data-layer` skill so it is enforced at
  authoring time rather than discovered in review.
- Generated types are committed so that spec drift shows up as a reviewable diff, and CI fails when
  regeneration produces changes.

## Reversibility

High. Coverage can be widened or narrowed per-endpoint at any time.
