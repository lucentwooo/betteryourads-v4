# Execution timings (for fun) ⏱️

How long each spec took to *execute* (code it), measured from the self-reported `duration_ms` of
each implementation/review/fix subagent. Subagents ran **sequentially**, so a spec's total is the
sum of its subagents. These are compute times only — wall-clock is higher once you add the
coordinator's reads/commits/pushes/doc-writing between dispatches. Planning (specs + Plan #1) isn't
counted here.

## Per-spec totals

| Spec | What | Subagents | Compute time |
|---|---|---:|---:|
| #1 | SSR foundation (Next.js + cache) | 8 | **13.5 min** |
| #2 | Concept board (legacy approach) | 4 | **18.2 min** |
| #3 | Core UX (workbench rewire, onboarding, modal, old-path delete) | 7 | **31.9 min** |
| #4 | Auth & accounts | 3 | **6.4 min** |
| #5 | Quotas & per-brand behavior | 6 | **21.4 min** |
| #6 | Bulk reference-ads + cleanup | 4 | **11.9 min** |
| | **Total** | **32** | **≈ 1 h 43 m** |

## Per-subagent detail

**Spec #1 — 13.5 min**
- Next scaffold 1.5m · cache 1.4m · layout+pages 1.5m · AppShell 1.2m · Home+Library 2.3m · remove SPA 1.1m · code-review 3.4m · use-client fix 1.0m

**Spec #2 — 18.2 min**
- additive backend (legacy prompt port) 4.6m · routes+persistence 3.8m · board page 7.3m · code-review 2.5m

**Spec #3 — 31.9 min** (the big one)
- cog popover 3.7m · onboarding+back 4.8m · workbench rewire 5.1m · delete old concept path 3.4m · start modal/rail/toast 8.0m · code-review 4.2m · fixes 2.6m

**Spec #4 — 6.4 min**
- signup password-confirm 2.6m · admin dashboard port 3.0m · code-review 0.9m

**Spec #5 — 21.4 min**
- AEST quota 3.1m · ad-brand scoping 5.3m · logo backend 2.7m · logo+usage UI 5.7m · code-review 3.7m · ownership fix 0.8m

**Spec #6 — 11.9 min**
- bulk ref-ads + react-router removal 5.4m · cleanup 2.2m · code-review 2.2m · drag-drop fix 2.2m

## Notes
- 32 subagent runs total: ~20 implementers, 6 code-reviews, ~6 fix passes.
- Every spec ended with a `/code-review` pass; findings were fixed before moving on.
- Caveat: durations are subagent self-reports (±10%); the coordinator's own work between them adds
  wall-clock not captured here.
