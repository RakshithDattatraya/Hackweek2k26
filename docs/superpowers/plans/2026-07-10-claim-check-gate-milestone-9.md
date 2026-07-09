# Content-Claim QA Gate (agent-native) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add an agent-native claim-check gate: the pipeline emits a claim-check request (PR diff + per-scene narration) and records a `claimReview` section in `qa-report.json`; the `enablement-video` skill performs the LLM claim-vs-diff review and writes `claims.json`, which the gate folds in.

**Architecture:** New `src/qa/claim-check.ts` (pure `buildClaimRequest`/`parseClaimFindings` + I/O `applyClaimGate`), a non-fatal wiring block in both orchestrators, and a claim-check section in `SKILL.md`. Render QA (`qa.ok`) is unchanged; claim review is additive.

**Tech Stack:** TypeScript, bun, `node:fs`. No new deps.

## Global Constraints

- No new npm dependencies.
- Render-QA semantics (`qa.ok`, `qa.findings`) unchanged — claim review is a separate `claimReview` section.
- Never hard-block: the claim block is try/caught in orchestrators; the pipeline stays draft-first.
- Deterministic pipeline: the LLM work is the skill/agent (out-of-band), not runtime code.

---

### Task 1: `src/qa/claim-check.ts`

**Files:** Create `src/qa/claim-check.ts`; Test `src/qa/claim-check.test.ts`

**Interfaces:**
- `type ClaimFinding = { sceneId?: string; claim: string; severity: "high" | "medium"; reason: string }`
- `type ClaimCheckRequest = { commits: string[]; diff: string; scenes: { id: string; narration: string }[] }`
- `buildClaimRequest(prContext: { commits: string[]; diff: string }, scenes: any[]): ClaimCheckRequest`
- `parseClaimFindings(text: string): ClaimFinding[]`
- `applyClaimGate(outDir: string, request: ClaimCheckRequest): { status: "pending" | "reviewed"; findings: ClaimFinding[] }`

- [ ] **Step 1: Write the failing test** — `src/qa/claim-check.test.ts`:

```ts
import { test, expect } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildClaimRequest, parseClaimFindings, applyClaimGate } from "./claim-check";

test("buildClaimRequest pulls narration from footage vs normal scenes", () => {
  const req = buildClaimRequest(
    { commits: ["feat: x"], diff: "diff-body" },
    [ { id: "a", narration: "hello" }, { id: "demo", footage: { narration: "in action" } } ],
  );
  expect(req.commits).toEqual(["feat: x"]);
  expect(req.diff).toBe("diff-body");
  expect(req.scenes).toEqual([ { id: "a", narration: "hello" }, { id: "demo", narration: "in action" } ]);
});

test("parseClaimFindings: clean array, fenced, malformed-dropped, garbage→[]", () => {
  const clean = JSON.stringify([{ sceneId: "s2", claim: "cuts time 50%", severity: "high", reason: "no metric in diff" }]);
  expect(parseClaimFindings(clean)).toEqual([{ sceneId: "s2", claim: "cuts time 50%", severity: "high", reason: "no metric in diff" }]);
  const fenced = "Here you go:\n```json\n" + clean + "\n```\nthanks";
  expect(parseClaimFindings(fenced).length).toBe(1);
  const mixed = JSON.stringify([{ claim: "ok", severity: "weird" }, { reason: "no claim" }, { claim: "  " }]);
  const r = parseClaimFindings(mixed);
  expect(r.length).toBe(1);        // only the first survives (claim present); severity clamped
  expect(r[0].severity).toBe("medium");
  expect(parseClaimFindings("not json at all")).toEqual([]);
  expect(parseClaimFindings("")).toEqual([]);
});

test("applyClaimGate writes the request; pending w/o claims.json, reviewed with it", () => {
  const dir = join(process.cwd(), "out/test-claim"); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const req = { commits: ["c"], diff: "d", scenes: [{ id: "a", narration: "n" }] };
  const pending = applyClaimGate(dir, req);
  expect(existsSync(join(dir, "claim-check-request.json"))).toBe(true);
  expect(pending.status).toBe("pending");
  expect(pending.findings).toEqual([]);
  writeFileSync(join(dir, "claims.json"), JSON.stringify([{ claim: "unsupported", severity: "high", reason: "r" }]));
  const reviewed = applyClaimGate(dir, req);
  expect(reviewed.status).toBe("reviewed");
  expect(reviewed.findings.length).toBe(1);
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run to verify fail** — `bun test src/qa/claim-check.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — `src/qa/claim-check.ts`:

```ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type ClaimFinding = { sceneId?: string; claim: string; severity: "high" | "medium"; reason: string };
export type ClaimCheckRequest = { commits: string[]; diff: string; scenes: { id: string; narration: string }[] };

/** Package the PR context + per-scene narration for the claim-check skill (footage scenes use footage.narration). */
export function buildClaimRequest(prContext: { commits: string[]; diff: string }, scenes: any[]): ClaimCheckRequest {
  const s = scenes.map((sc) => ({
    id: String(sc?.id ?? ""),
    narration: String(sc?.footage?.narration ?? sc?.narration ?? ""),
  }));
  return { commits: prContext.commits ?? [], diff: prContext.diff ?? "", scenes: s };
}

/** Tolerant parse of the skill's JSON output into ClaimFindings (strips fences/prose, drops malformed). */
export function parseClaimFindings(text: string): ClaimFinding[] {
  if (!text) return [];
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  else { const arr = t.match(/\[[\s\S]*\]/); if (arr) t = arr[0]; }
  let parsed: unknown;
  try { parsed = JSON.parse(t); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const out: ClaimFinding[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const claim = (item as any).claim;
    if (typeof claim !== "string" || !claim.trim()) continue;
    out.push({
      sceneId: typeof (item as any).sceneId === "string" ? (item as any).sceneId : undefined,
      claim: claim.trim(),
      severity: (item as any).severity === "high" ? "high" : "medium",
      reason: typeof (item as any).reason === "string" ? (item as any).reason : "",
    });
  }
  return out;
}

/** Write the claim-check request; fold in claims.json if the skill produced it, else mark pending. */
export function applyClaimGate(outDir: string, request: ClaimCheckRequest): { status: "pending" | "reviewed"; findings: ClaimFinding[] } {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "claim-check-request.json"), JSON.stringify(request, null, 2));
  const claimsPath = join(outDir, "claims.json");
  if (existsSync(claimsPath)) {
    return { status: "reviewed", findings: parseClaimFindings(readFileSync(claimsPath, "utf8")) };
  }
  return { status: "pending", findings: [] };
}
```

- [ ] **Step 4: Run to verify pass** — `bun test src/qa/claim-check.test.ts` → PASS (3).

- [ ] **Step 5: Commit**
```bash
git add src/qa/claim-check.ts src/qa/claim-check.test.ts
git commit -m "feat: claim-check module — request builder, tolerant parser, gate merge"
```

---

### Task 2: Wire `claimReview` into both orchestrators + SKILL.md

**Files:** Modify `src/pipeline/build-plan.ts`, `src/pipeline/build-from-branch.ts`, `.claude/skills/enablement-video/SKILL.md`; Test `src/pipeline/claim-review-wiring.test.ts`

**Interfaces:** none new exported; `qa-report.json` gains `claimReview: { status, findings }`.

- [ ] **Step 1: Write the failing test** — `src/pipeline/claim-review-wiring.test.ts`:

```ts
import { test, expect } from "bun:test";
import { rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildFromPlan } from "./build-plan";

test("buildFromPlan adds a claimReview section to qa-report.json", async () => {
  const dir = join(process.cwd(), "out/test-claimwire"); rmSync(dir, { recursive: true, force: true });
  // minimal 2-scene custom plan written to a temp file
  const plan = {
    feature_name: "F", value_prop: "v", persona: "p", when_to_use: "w", talking_points: ["t"],
    scenes: [
      { id: "a", html: "<div style='color:var(--uip-white)'>Alpha</div>", narration: "Alpha beat." },
      { id: "b", html: "<div style='color:var(--uip-white)'>Beta</div>", narration: "Beta beat." },
    ],
    youtube_metadata: { title: "", description: "", tags: [], chapters: [] },
  };
  const planPath = join(process.cwd(), "out/test-claimwire-plan.json");
  require("node:fs").mkdirSync(dir, { recursive: true });
  require("node:fs").writeFileSync(planPath, JSON.stringify(plan));
  await buildFromPlan(planPath, dir);
  const qa = JSON.parse(readFileSync(join(dir, "qa-report.json"), "utf8"));
  expect(typeof qa.ok).toBe("boolean");
  expect(Array.isArray(qa.findings)).toBe(true);
  expect(qa.claimReview).toBeDefined();
  expect(["pending", "reviewed"]).toContain(qa.claimReview.status);
  expect(Array.isArray(qa.claimReview.findings)).toBe(true);
  rmSync(dir, { recursive: true, force: true }); rmSync(planPath, { force: true });
}, 180000);
```

- [ ] **Step 2: Run to verify fail** — with render env (NVM, HYPERFRAMES_NODE_BIN, ELEVENLABS_VOICE_ID=ErXwobaYiN019PkySvjV): `bun test src/pipeline/claim-review-wiring.test.ts` → FAIL (`qa.claimReview` undefined).

- [ ] **Step 3a: Wire `build-plan.ts`.** Add imports near the top:
```ts
import { getPrContext } from "../ingest/pr-context";
import { buildClaimRequest, applyClaimGate } from "../qa/claim-check";
```
Find the QA block:
```ts
  const qa = runGate(plan as any, tokens, outDir);
  writeFileSync(join(outDir, "qa-report.json"), JSON.stringify(qa, null, 2));
  if (!qa.ok) console.warn(`QA gate found ${qa.findings.length} issue(s) — see qa-report.json (self-review loop / human should resolve).`);
```
and REPLACE the `writeFileSync(...qa...)` line with a claim-augmented write (keep the `runGate` and the warn):
```ts
  const qa = runGate(plan as any, tokens, outDir);
  let report: any = qa;
  try {
    const pr = getPrContext();
    const claimReview = applyClaimGate(outDir, buildClaimRequest({ commits: pr.commits, diff: pr.diff }, plan.scenes as any));
    report = { ...qa, claimReview };
  } catch (e: any) { console.warn("Claim-check skipped:", e?.message); }
  writeFileSync(join(outDir, "qa-report.json"), JSON.stringify(report, null, 2));
  if (!qa.ok) console.warn(`QA gate found ${qa.findings.length} issue(s) — see qa-report.json (self-review loop / human should resolve).`);
```

- [ ] **Step 3b: Wire `build-from-branch.ts`.** It already imports `getPrContext`. Add:
```ts
import { buildClaimRequest, applyClaimGate } from "../qa/claim-check";
```
Find its QA write block:
```ts
  const qa = { ok: gateBase.findings.length + segFindings.length === 0, findings: [...gateBase.findings, ...segFindings] };
  writeFileSync(join(outDir, "qa-report.json"), JSON.stringify(qa, null, 2));
  if (!qa.ok) console.warn(`QA gate found ${qa.findings.length} issue(s) — see qa-report.json.`);
```
and REPLACE the write line with a claim-augmented write:
```ts
  const qa = { ok: gateBase.findings.length + segFindings.length === 0, findings: [...gateBase.findings, ...segFindings] };
  let report: any = qa;
  try {
    const pr = getPrContext();
    const claimReview = applyClaimGate(outDir, buildClaimRequest({ commits: pr.commits, diff: pr.diff }, plan.scenes as any));
    report = { ...qa, claimReview };
  } catch (e: any) { console.warn("Claim-check skipped:", e?.message); }
  writeFileSync(join(outDir, "qa-report.json"), JSON.stringify(report, null, 2));
  if (!qa.ok) console.warn(`QA gate found ${qa.findings.length} issue(s) — see qa-report.json.`);
```

- [ ] **Step 3c: Add the claim-check section to `.claude/skills/enablement-video/SKILL.md`.** Append this section verbatim:
```markdown
## Claim-check (pre-publish, before the human review gate)
The pipeline writes `out/**/claim-check-request.json` = `{ commits, diff, scenes: [{ id, narration }] }`.
Before a draft is handed to a human, review it for hallucinated claims:
- For each scene's narration, check every factual claim against the `diff`/`commits` (the ground truth).
- Flag anything the source does NOT support — especially metrics/percentages ("cuts time 40%"),
  named integrations ("now supports SSO"), and absolute guarantees ("fully automated", "zero errors").
  When unsure, flag it. General positioning/framing that isn't a factual product claim is fine.
- Write the findings as a JSON array to `claims.json` in the same output dir, each item:
  `{ "sceneId": "<id>", "claim": "<quoted words>", "severity": "high"|"medium", "reason": "<why unsupported>" }`.
  Empty array `[]` means nothing unsupported.
The gate folds `claims.json` into `qa-report.json` as `claimReview`. Safe to publish =
render-QA `ok` AND `claimReview.status === "reviewed"` AND no `high`-severity claim.
```

- [ ] **Step 4: Run to verify pass** — with render env exported:
```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use stable
export HYPERFRAMES_NODE_BIN="/Users/rakshithdattatrayahegde/.nvm/versions/node/v24.14.1/bin"
export ELEVENLABS_VOICE_ID="ErXwobaYiN019PkySvjV"; export ELEVENLABS_STYLE="0.6"; export ELEVENLABS_STABILITY="0.35"
bun test src/pipeline/claim-review-wiring.test.ts
```
Expected: PASS — `qa-report.json` has a `claimReview` object (status `pending`, findings `[]`), and `ok`/`findings` are still present.

- [ ] **Step 5: Regression** — `bun test src/pipeline/build-from-branch-qa.test.ts` (same env) → PASS (footage path still writes a valid qa-report.json, now also with `claimReview`).

- [ ] **Step 6: Commit**
```bash
git add src/pipeline/build-plan.ts src/pipeline/build-from-branch.ts .claude/skills/enablement-video/SKILL.md src/pipeline/claim-review-wiring.test.ts
git commit -m "feat: wire agent-native claimReview into qa-report + document the claim-check skill step"
```

---

## Self-Review

- **Coverage:** module (T1), both-orchestrator wiring + SKILL.md (T2). Spec covered.
- **Placeholders:** none.
- **Type consistency:** `buildClaimRequest`/`parseClaimFindings`/`applyClaimGate` signatures match definitions and call sites; `ClaimCheckRequest`/`ClaimFinding` shapes match the SKILL.md `claims.json` contract.
- **Non-regression:** render-QA `qa.ok`/`findings` unchanged; claim block is try/caught (never fails a build); `claimReview` is additive. `getPrContext()` degrades to empty diff off-repo.
- **Agent-native:** the LLM work lives in SKILL.md (the skill writes `claims.json`); code only builds the request and folds results — consistent with the content-director seam.
