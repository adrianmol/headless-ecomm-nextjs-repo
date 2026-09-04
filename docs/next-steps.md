# Harness incident and next steps — 2026-09-04

Status of this document: **recommendations, not authority.** The canonical plan is the
Master implementation plan in `DEVIN_HANDOFF.md`; where the two disagree, that file wins.
This exists because the scheduled-agent harness failed overnight in a way worth recording,
and because two of the recommendations below contradict the plan's current ordering and need
an owner decision rather than a silent edit.

Everything here was measured on 2026-09-04, not inferred.

---

## 1. What happened

The scheduled monitor (`~/.config/devin/handoff-monitor/`, launchd label
`ai.devin.handoff-monitor`, 300 s interval) degraded and then stalled. It has done no useful
work since 17:28 on 2026-09-03.

| Window (UTC)  | Behaviour                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------- |
| 15:36 → 17:28 | Healthy. Run durations 70 s, 50 s, 475 s, 535 s, 470 s, 955 s, 875 s                            |
| 17:46 → 03:16 | Six runs killed by the 2400 s watchdog. One completed at 2205 s — 3 minutes under the wire      |
| 09:18 onward  | Circuit breaker tripped; skipping every 5 minutes with "3 consecutive failures … needs a human" |

The breaker is the only reason this stopped rather than churning all night. **Stuck is the
safe state** until fault 3 below is fixed; do not clear
`~/.config/devin/handoff-monitor/attempts` before then.

## 2. Root cause: three compounding faults in the wrapper

1. **Runs outgrew the ceiling.** Each run executes the full verification suite plus three
   Lighthouse runs per URL. The suite has grown to 32 E2E tests, and a legitimate milestone
   stopped fitting in 40 minutes. The near-miss at 2205 s shows how close the margin already
   was before it went negative.
2. **A killed run leaves no diagnostics.** The CLI is invoked with `--print`, which buffers
   output and emits it on completion. All five timed-out runs therefore wrote **0-byte
   transcripts**. The failure had to be reconstructed from `launchd.err.log`
   (`Terminated: 15`). A timeout is currently the one failure mode that destroys its own
   evidence.
3. **No dirty-tree guard — the serious one.** Each timeout left the working tree
   half-modified, and the next scheduled run began on top of that partial state. Successive
   unsupervised runs compounding on an unreviewed diff is the mechanism by which this
   harness could do real damage, and nothing currently prevents it.

## 3. State of the working tree

12 modified files plus an untracked `e2e/seo.spec.ts`: 565 insertions, 28 deletions. It is a
half-finished Phase 3 SEO milestone.

| Gate                | Result                                                   |
| ------------------- | -------------------------------------------------------- |
| `pnpm lint`         | passes                                                   |
| `pnpm format:check` | **fails** — `src/app/(catalog)/products/[slug]/page.tsx` |
| `pnpm typecheck`    | passes                                                   |
| `pnpm test`         | passes, 119 across 9 files                               |

`src/app/sitemap.ts` and `src/app/robots.ts` do not exist, so the milestone is genuinely
incomplete rather than merely unpolished. It is not commit-ready as it stands.

Two parts need attention beyond formatting:

- **`src/commerce/errors.ts`, +88/−0, with `errors.test.ts` +88/−1.** Adds a `Symbol.for`
  brand to `CommerceErrorException` plus type guards, because `instanceof` does not survive
  the RSC boundary. This is a subtle and plausibly correct fix in the most safety-critical
  module in the repository. It is **not SEO work** and must not ride inside an SEO commit.
  Review it against the `commerce-data-layer` skill on its own merits.
- **`STOREFRONT_URL`** in `src/lib/env.ts` and `.env.example`. Correctly handled: the
  placeholder is `https://storefront.example` and the Zod schema is `.optional()`. No
  production domain was invented. Noted because the rule it respected is one that has been
  broken before.

## 4. Review debt

Five commits landed with no human review:

| Commit    | Subject                                                                         |
| --------- | ------------------------------------------------------------------------------- |
| `17f5108` | Restore 10 kB of PDP script headroom by extracting shared default-button styles |
| `be4f720` | Fix Phase 2 button size-class regression and add visual-equivalence test        |
| `c98c27a` | Add Phase 3 cursor pagination for `/products`                                   |
| `c0a329e` | Record commit hash for Phase 3 cursor pagination milestone                      |
| `7db7d88` | Fix Phase 3 pagination Suspense geometry for odd terminal pages                 |

`be4f720` fixes a regression introduced by `17f5108`; `7db7d88` fixes one introduced by
`c98c27a`. **Two of the five commits exist only to repair defects the loop itself shipped one
cycle earlier.** Each defect reached `main` unreviewed and lived there for a cycle. This is
the strongest available argument for changing the supervision model, and it is a measurement
rather than an opinion.

Separately, pagination shipped `PAGE_SIZE = 2`. That reads as a value chosen to make the
terminal-page test reachable with four fixtures, not as a product decision.

## 5. Recommended sequence

### A. Stabilise the harness — before any further feature work

- **A1.** Triage the uncommitted work. Run the _full_ suite including `build:ci` and `e2e`,
  then split it: the `errors.ts` branding fix as its own reviewed commit, the SEO work as
  another. Do not bulk-commit 12 files nobody has read. Discard and redo is an acceptable
  outcome if review is slower than reimplementation.
- **A2.** Fix the three wrapper faults: stream the transcript so a timeout is diagnosable;
  raise or remove the watchdog and rely on the lock for mutual exclusion; and refuse to
  start a run when the tree is dirty. A2 requires no owner decision and can proceed
  immediately.
- **A3.** Settle the supervision model (§6).

### B. Pay down the review debt

Review the five commits above, ideally with the `commerce-reviewer` subagent, and resolve
`PAGE_SIZE`.

### C. Phase 4 — security and operational endpoints

CSP and security headers, CSRF/origin verification on mutations, `/health` with an explicit
contract, the log-hygiene audit, XSS and open-redirect audits, dependency automation.
Roughly 13 locally actionable items.

### D. Phase 3 — finish catalog navigation and SEO

Per-product metadata, canonical URLs, Open Graph, Product/Offer/BreadcrumbList JSON-LD with
availability read from the **live offer** rather than the cached shell, `sitemap.ts`,
`robots.ts`, the supporting assertions, and the prefetch audit.

### E. Backend-blocked items

Around 30 `[!]` entries across Phases 3–8. No local action; keep them honestly marked rather
than quietly implementing storefront substitutes.

## 6. Open decisions

These block or reorder the above and are owner calls, recorded here rather than assumed.

1. **Supervision model.** Five-minute unattended runs with `--permission-mode dangerous`,
   each producing a 40-minute milestone, is not working — §4 quantifies the cost. Suggested
   alternative: one checklist item per run, stopping for review; or drop the timer and invoke
   runs deliberately.
2. **The abandoned SEO work** — salvage and split, or discard and redo cleanly?
3. **`PAGE_SIZE = 2`** — real product value, or a test artefact to correct?
4. **Ordering: security before SEO.** This document puts Phase 4 ahead of Phase 3, which
   contradicts the Master implementation plan. Rationale: SEO makes a storefront
   _discoverable_, whereas security headers, CSRF verification and log hygiene make it
   _shippable_. The site currently has no CSP, no HSTS, no automated header tests and an
   unaudited log surface. Optimising the discoverability of something that cannot yet be
   deployed is the wrong order. This is a recommendation, not a change — the plan still says
   Phase 3 first.
5. **`STOREFRONT_URL` production domain.** Canonical URLs and Open Graph tags are wrong
   without it. A genuine external blocker for Phase 3, and it cannot be invented locally.
