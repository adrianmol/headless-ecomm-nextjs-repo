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

The breaker is the only reason this stopped rather than churning all night.

> **Superseded on 2026-09-04: the harness has been removed.** The owner deleted
> `~/.config/devin/handoff-monitor/`, removed
> `~/Library/LaunchAgents/ai.devin.handoff-monitor.plist`, and unloaded the launchd job.
> Verified afterwards: no launchd agent, no wrapper process, no headless CLI process, and no
> orphaned mock APIs on 3101/4021/4010. **Nothing runs on a timer.** Work now happens only
> when the owner asks for it in a session.
>
> Sections 1, 2 and 4 below are retained as history — they are why the review debt in §4
> exists, and the faults are worth knowing if a scheduled harness is ever rebuilt. The
> operational instructions in them no longer apply.

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

**Complete as of 2026-09-04.** Retained for the record:

- **A1 — done.** The abandoned work was triaged and landed as two commits: `fc54233` (the
  `errors.ts` brand and guard, split out and labelled unreferenced) and `675c630` (the robots
  fix, debug-logging removal, and the SEO work). Fixing it turned up two defects beyond the
  reported one: six debug `console.log` calls in production paths, four of them logging the
  raw attacker-supplied `slug`; and an orphaned mock API on port 4010 that made a `build:ci`
  report PASS against a stale mock. Full detail in the `DEVIN_HANDOFF.md` entry for that date.
- **A2 — moot.** The wrapper it proposed to fix no longer exists. A fourth fault was
  identified before removal and is recorded here in case a harness is rebuilt: the watchdog's
  kill did not reap grandchildren, so killed runs orphaned `scripts/mock-api.mjs` on port
  4010, and `with-mock-api.mjs` waits for _a_ healthy API on that port rather than one it
  started — which silently corrupts build measurements.
- **A3 — settled.** No scheduled runs. This answers decision 1 in §6.

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

1. ~~**Supervision model.**~~ **Settled 2026-09-04: no scheduled runs.** The harness was
   removed entirely. Five-minute unattended runs with `--permission-mode dangerous`, each
   producing a 40-minute milestone, was not working, and §4 quantifies the cost: two of five
   unreviewed commits existed only to repair defects the loop had shipped a cycle earlier.
   Work now happens when the owner asks for it.
2. ~~**The abandoned SEO work.**~~ **Settled 2026-09-04: salvaged and split**, as `fc54233`
   and `675c630`. See §5A.
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
6. **CSP `script-src`: `'unsafe-inline'` or a nonce?** Headers landed on 2026-09-04 with
   `script-src 'self' 'unsafe-inline'`. The strict alternative is a per-request nonce, and the
   cost of that was measured rather than assumed:

   | Route                 | Inline `<script>` blocks | Carrying a nonce             |
   | --------------------- | ------------------------ | ---------------------------- |
   | `/` (static `○`)      | 12                       | **0 — all would be blocked** |
   | `/cart` (dynamic `◐`) | 4                        | 3 — nonce applied            |

   A nonce cannot be embedded in prerendered HTML, so with nonce middleware in place the
   static routes serve 12 inline scripts that the policy then refuses. The build still
   reported `/` as `○` static, with no warning — the breakage is silent and only visible in a
   browser enforcing the policy. Adopting a nonce therefore means making every HTML response
   dynamic and giving up the static shell `cacheComponents` exists to provide.

   Options: keep `'unsafe-inline'` and accept weaker inline-XSS protection while retaining
   the static shell; or adopt a nonce and render all HTML per request. Everything else in the
   policy is already strict — no foreign script origin, no `eval` in production, no framing,
   no off-origin form posts — so this decision is narrowly about inline script execution.
