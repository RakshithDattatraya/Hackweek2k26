# Content-Claim QA Gate (agent-native) — Design Spec

**Date:** 2026-07-10
**Sub-project:** Claim-check QA gate (Milestone 9)
**Status:** Draft design → pending user review

## Goal

Catch narration that claims something the PR/diff doesn't support — the brief's #1 trust
rule ("do NOT invent claims the diff doesn't support"). Agent-native, matching the
content-director seam: the pipeline defines the contract + emits a request; the
`enablement-video` Claude skill performs the actual LLM claim-vs-diff review and writes
findings; the gate folds them into `qa-report.json` for the human review gate.

## Why agent-native (not runtime API)

Consistent with the existing "LLM upgrade seam" (`content-director.ts`): deterministic code
defines the contract, the Claude skill is the brain. No API key, no runtime network, no
non-determinism in the pipeline. The claim-check runs as part of the draft→human/agent
review flow ("capture, not publish").

## Architecture

Render QA (determinism/brand/render → `qa.ok`) stays exactly as-is. Claim review is a
**separate section** of the report so the two concerns don't conflate:

```
qa-report.json = { ok, findings, claimReview: { status: "pending" | "reviewed", findings: ClaimFinding[] } }
```

Flow:
1. On every build, the pipeline writes `<outDir>/claim-check-request.json` — the context the
   skill needs: `{ commits, diff, scenes: [{ id, narration }] }` (diff/commits from
   `getPrContext()`; narration pulled per scene, incl. footage scenes).
2. If `<outDir>/claims.json` already exists (the skill/agent ran), the gate parses it →
   `claimReview = { status: "reviewed", findings }`. Else `{ status: "pending", findings: [] }`.
3. "Safe to publish" = `qa.ok && claimReview.status === "reviewed" && no high-severity claim
   findings` — documented for the human gate; the pipeline never hard-blocks (draft-first).

### New unit — `src/qa/claim-check.ts`

- `type ClaimFinding = { sceneId?: string; claim: string; severity: "high" | "medium"; reason: string }`
- `type ClaimCheckRequest = { commits: string[]; diff: string; scenes: { id: string; narration: string }[] }`
- `buildClaimRequest(prContext: { commits: string[]; diff: string }, scenes: any[]): ClaimCheckRequest`
  — PURE. Per scene: `narration` = `s.footage.narration` for footage scenes, else `s.narration`.
- `parseClaimFindings(text: string): ClaimFinding[]` — PURE. Tolerant parse of the skill's JSON
  (strips ```json fences / surrounding prose), validates each item shape, drops malformed;
  clamps `severity` to `high|medium`.
- `applyClaimGate(outDir: string, request: ClaimCheckRequest): { status: "pending" | "reviewed"; findings: ClaimFinding[] }`
  — I/O. Writes `claim-check-request.json`. If `claims.json` exists → parse it (reviewed); else pending.

### Skill — `.claude/skills/enablement-video/SKILL.md`

Add a "Claim-check (pre-publish)" section: read `claim-check-request.json`; for each scene,
flag any narration claim not grounded in the diff/commits — especially metrics/percentages,
named integrations, and absolute guarantees; write `claims.json` (a `ClaimFinding[]`) to the
output dir. Ground truth = the diff; when unsure, flag it. Empty array = nothing unsupported.

### Wiring — `src/pipeline/build-plan.ts` and `src/pipeline/build-from-branch.ts`

After the existing `runGate` writes `qa-report.json`, add a non-fatal block: build the request
(`getPrContext()` + `plan.scenes`), call `applyClaimGate`, and re-write `qa-report.json` with
the added `claimReview` section. Wrap in try/catch (never fail the build). `buildFromBranch`
already has `getPrContext`; `build-plan.ts` gains the import.

## Error handling

- No git / no diff → `getPrContext` degrades to empty diff (existing behavior); request still
  written; claim-check is best-effort.
- Malformed `claims.json` → `parseClaimFindings` drops bad items; if unparseable, treat as
  pending (don't crash).
- The whole claim block is try/caught in the orchestrators → never breaks the video build.

## Testing

- `claim-check.test.ts`:
  - `buildClaimRequest` pulls narration from footage vs normal scenes; includes commits/diff.
  - `parseClaimFindings`: parses a clean JSON array; strips ```json fences; drops malformed
    entries; empty/garbage → `[]`.
  - `applyClaimGate`: writes `claim-check-request.json`; returns `pending` with no `claims.json`;
    returns `reviewed` + findings when a `claims.json` is present.
- Wiring test: after a build, `qa-report.json` contains a `claimReview` object with a valid
  `status`; existing `ok`/`findings` unchanged.

## Out of scope

- Runtime Anthropic API call (chose agent-native).
- Auto-fixing/ rewriting flagged narration (human decides).
- Hard-blocking publish (draft-first; human gate decides).

## Global constraints (carried)

- No new npm deps; `node:fs` + existing modules. bun runtime.
- Render QA (`qa.ok`) semantics unchanged; claim review is additive.
- Deterministic pipeline (the LLM work is the skill/agent, out-of-band).
