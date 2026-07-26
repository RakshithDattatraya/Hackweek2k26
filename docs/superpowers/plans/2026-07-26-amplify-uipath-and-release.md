# Amplify — UiPath Agent + Release Enablement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `release` entry point (GitHub Release → humanized one-pager + digest, internal-first) alongside the existing `feature` path, auto-routed by input URL; and wrap the whole pipeline in a UiPath coded agent (Agents SDK) that stores every asset in a Data Service entity and gates on Action Center — the pipeline logic unchanged.

**Architecture:** Two layers. (1) TS/Bun pipeline gains: a URL router, a `ReleasePlan` schema, release ingest, a release one-pager renderer, a digest renderer, and a `buildRelease` orchestrator + CLI — all fully unit-tested. (2) A Python coded agent orchestrates ingest → Claude (via AI Trust Layer) → invoke the TS render → Data Service entity → Action Center → publish, with every UiPath call behind a `Platform` port so the orchestration logic is tested against a fake.

**Tech Stack:** TypeScript + Bun + zod (pipeline); Python + UiPath Agents SDK (agent); existing HyperFrames/GSAP/FFmpeg render; Claude via UiPath AI Trust Layer.

## Global Constraints

- The content director (Claude authoring plans) and the render pipeline are **unchanged** — new code only adds ingest, routing, release renderers, and orchestration. Same plan in → same output.
- **Claim-check applies to releases too**: the release path builds a claim-check request from the release notes + PRs; a `high`-severity flag blocks publish.
- **Media in Storage Bucket, metadata in the entity** — the entity stores URLs, never the mp4/PDF bytes.
- **Custom prompt = steering only** — it augments the PR/Jira/release grounding, never overrides source facts.
- **Release outputs are internal-first** and are **one-pager + digest only (no video)**; **feature outputs are video + one-pager only (no digest)**. Each path emits only its own artifacts.
- All rendered output uses brand tokens (`var(--uip-*)` / `loadBrandTokens()`), never off-brand hex.
- No hardcoded secrets. UiPath auth via OAuth external app; Claude via AI Trust Layer (no Anthropic key).

## File Structure

**Phase 1 — Release feature (TS/Bun, fully testable):**
- Create `src/ingest/source-router.ts` — classify a GitHub URL → `"feature" | "release"`.
- Create `src/content-director/release-plan-schema.ts` — `ReleasePlan` zod schema + validator.
- Create `src/ingest/release-context.ts` — parse release URL + parse release-notes body → `ReleaseContext`.
- Create `src/qa/release-claim-check.ts` — build a claim-check request from a `ReleaseContext` + `ReleasePlan`.
- Create `src/onepager/render-release-html.ts` — multi-highlight release one-pager (self-contained HTML).
- Create `src/release/build-digest.ts` — Slack markdown + Confluence HTML from a `ReleasePlan`.
- Create `src/pipeline/build-release.ts` — orchestrator: `ReleaseContext` + `ReleasePlan` → one-pager + digest in `outDir`; CLI entry.
- Tests colocated: `*.test.ts` beside each.

**Phase 2 — UiPath coded agent (Python):**
- Create `agent/platform.py` — `Platform` Protocol + `FakePlatform` (in-memory) for tests.
- Create `agent/orchestrator.py` — `run(source_url, custom_prompt, platform, brain) -> AssetRecord` (pure logic).
- Create `agent/brain.py` — `Brain` Protocol (authors plans + claim-check) + a subprocess/HTTP impl calling Claude via AI Trust Layer.
- Create `agent/uipath_platform.py` — concrete `Platform` over the UiPath SDK (tenant-wiring; bindings filled from the Agents SDK docs).
- Create `agent/main.py` — coded-agent entry point.
- Tests: `agent/test_orchestrator.py`, `agent/test_router_parity.py`.

---

## Task 1: Source-URL router

**Files:**
- Create: `src/ingest/source-router.ts`
- Test: `src/ingest/source-router.test.ts`

**Interfaces:**
- Produces: `classifySource(url: string): "feature" | "release" | "unknown"`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "bun:test";
import { classifySource } from "./source-router";

test("release URLs classify as release", () => {
  expect(classifySource("https://github.com/UiPath/fins-vertical-solution/releases/tag/v2604.195.0")).toBe("release");
  expect(classifySource("https://github.com/UiPath/fins-vertical-solution/releases#release-v2604.195.0")).toBe("release");
});

test("PR / merge URLs classify as feature", () => {
  expect(classifySource("https://github.com/UiPath/fins-vertical-solution/pull/1423")).toBe("feature");
  expect(classifySource("https://github.com/UiPath/fins-vertical-solution/commit/abc123")).toBe("feature");
});

test("unrecognized URLs are unknown", () => {
  expect(classifySource("https://github.com/UiPath/fins-vertical-solution")).toBe("unknown");
  expect(classifySource("not-a-url")).toBe("unknown");
});
```

- [ ] **Step 2: Run test to verify it fails** — `bun test src/ingest/source-router.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
/** Classify a GitHub source URL into a pipeline entry point. Pure; no network. */
export function classifySource(url: string): "feature" | "release" | "unknown" {
  const u = url.trim();
  if (/\/releases\/tag\/[^/]+/.test(u) || /\/releases#release-/.test(u)) return "release";
  if (/\/pull\/\d+/.test(u) || /\/commit\/[0-9a-f]{7,40}/i.test(u)) return "feature";
  return "unknown";
}
```

- [ ] **Step 4: Run tests to verify they pass** — `bun test src/ingest/source-router.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add src/ingest/source-router.* && git commit -m "feat: source-url router (feature vs release)"`

---

## Task 2: ReleasePlan schema

**Files:**
- Create: `src/content-director/release-plan-schema.ts`
- Test: `src/content-director/release-plan-schema.test.ts`

**Interfaces:**
- Produces: `ReleasePlanSchema` (zod), `type ReleasePlan`, `validateReleasePlan(data): ReleasePlan`.

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "bun:test";
import { validateReleasePlan } from "./release-plan-schema";

const good = {
  release_name: "FinS Vertical Solution", version: "v2604.195.0",
  theme: "Faster onboarding + compliance",
  audience: "internal",
  highlights: [{ title: "X", value_line: "Y", persona: "Ops", group: "New capabilities", source_pr: "https://github.com/o/r/pull/1" }],
  long_tail: [{ title: "Minor fix", source_pr: "https://github.com/o/r/pull/2" }],
  what_to_tell_customers: ["Lead with time-to-value."],
  notes_url: "https://github.com/o/r/releases/tag/v2604.195.0",
};

test("accepts a valid release plan", () => {
  expect(validateReleasePlan(good).version).toBe("v2604.195.0");
});

test("rejects a plan with no highlights", () => {
  expect(() => validateReleasePlan({ ...good, highlights: [] })).toThrow();
});

test("rejects an invalid group value", () => {
  const bad = { ...good, highlights: [{ ...good.highlights[0], group: "Random" }] };
  expect(() => validateReleasePlan(bad)).toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails** — FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
import { z } from "zod";

export const ReleaseHighlightSchema = z.object({
  title: z.string().min(1),
  value_line: z.string().min(1),
  persona: z.string().min(1),
  group: z.enum(["New capabilities", "Improvements", "Fixes that matter"]),
  source_pr: z.string().url(),
  jira_key: z.string().optional(),
});

export const ReleasePlanSchema = z.object({
  release_name: z.string().min(1),
  version: z.string().min(1),
  theme: z.string().min(1),
  audience: z.literal("internal"),
  highlights: z.array(ReleaseHighlightSchema).min(1).max(8),
  long_tail: z.array(z.object({ title: z.string().min(1), source_pr: z.string().url() })).default([]),
  what_to_tell_customers: z.array(z.string()).default([]),
  notes_url: z.string().url(),
});

export type ReleasePlan = z.infer<typeof ReleasePlanSchema>;
export function validateReleasePlan(data: unknown): ReleasePlan { return ReleasePlanSchema.parse(data); }
```

- [ ] **Step 4: Run tests to verify they pass** — PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat: ReleasePlan schema"`

---

## Task 3: Release ingest (URL parse + notes parse)

**Files:**
- Create: `src/ingest/release-context.ts`
- Test: `src/ingest/release-context.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `parseReleaseUrl(url): { owner: string; repo: string; tag: string }`
  - `parseReleaseNotes(body: string): { prs: { number: number; title: string; url: string }[] }`
  - `type ReleaseContext = { owner; repo; tag; name; body; prs: {number,title,url}[] }`
  - `fetchReleaseContext(url, gh: GithubReader): Promise<ReleaseContext>` where
    `type GithubReader = { getReleaseByTag(owner,repo,tag): Promise<{name,body}> }` (injected; real impl in Phase 2).

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "bun:test";
import { parseReleaseUrl, parseReleaseNotes, fetchReleaseContext } from "./release-context";

test("parses owner/repo/tag from a release URL", () => {
  expect(parseReleaseUrl("https://github.com/UiPath/fins-vertical-solution/releases/tag/v2604.195.0"))
    .toEqual({ owner: "UiPath", repo: "fins-vertical-solution", tag: "v2604.195.0" });
  expect(parseReleaseUrl("https://github.com/o/r/releases#release-v1.2.3").tag).toBe("v1.2.3");
});

test("parses PR links from auto-generated release notes", () => {
  const body = "## What's Changed\n* Add public app toggle by @a in https://github.com/o/r/pull/1423\n* Fix crash by @b in https://github.com/o/r/pull/1424\n";
  expect(parseReleaseNotes(body).prs).toEqual([
    { number: 1423, title: "Add public app toggle", url: "https://github.com/o/r/pull/1423" },
    { number: 1424, title: "Fix crash", url: "https://github.com/o/r/pull/1424" },
  ]);
});

test("fetchReleaseContext composes URL + reader + notes", async () => {
  const gh = { async getReleaseByTag() { return { name: "FinS v2604.195.0", body: "* T by @a in https://github.com/o/r/pull/9" }; } };
  const ctx = await fetchReleaseContext("https://github.com/o/r/releases/tag/v2604.195.0", gh);
  expect(ctx.tag).toBe("v2604.195.0");
  expect(ctx.prs[0].number).toBe(9);
});
```

- [ ] **Step 2: Run test to verify it fails** — FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
export type GithubReader = { getReleaseByTag(owner: string, repo: string, tag: string): Promise<{ name: string; body: string }> };
export type ReleaseContext = { owner: string; repo: string; tag: string; name: string; body: string; prs: { number: number; title: string; url: string }[] };

export function parseReleaseUrl(url: string): { owner: string; repo: string; tag: string } {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/releases\/tag\/([^/?#]+)/)
        ?? url.match(/github\.com\/([^/]+)\/([^/]+)\/releases#release-([^/?#]+)/);
  if (!m) throw new Error(`Not a release URL: ${url}`);
  return { owner: m[1], repo: m[2], tag: m[3] };
}

export function parseReleaseNotes(body: string): { prs: { number: number; title: string; url: string }[] } {
  const prs: { number: number; title: string; url: string }[] = [];
  const re = /^\s*[*-]\s*(.+?)\s+by\s+@\S+\s+in\s+(https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+))/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) prs.push({ title: m[1].trim(), url: m[2], number: Number(m[3]) });
  return { prs };
}

export async function fetchReleaseContext(url: string, gh: GithubReader): Promise<ReleaseContext> {
  const { owner, repo, tag } = parseReleaseUrl(url);
  const { name, body } = await gh.getReleaseByTag(owner, repo, tag);
  return { owner, repo, tag, name, body, prs: parseReleaseNotes(body).prs };
}
```

- [ ] **Step 4: Run tests to verify they pass** — PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat: release ingest — URL + notes parsing"`

---

## Task 4: Release claim-check request builder

**Files:**
- Create: `src/qa/release-claim-check.ts`
- Test: `src/qa/release-claim-check.test.ts`

**Interfaces:**
- Consumes: `ReleaseContext` (Task 3), `ReleasePlan` (Task 2).
- Produces: `buildReleaseClaimRequest(ctx, plan): { notes: string; prs: {...}[]; claims: { id: string; text: string }[] }` — mirrors the feature `buildClaimRequest` shape so the same agent review step handles both. Each highlight's `value_line` + each `what_to_tell_customers` line becomes a checkable claim.

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "bun:test";
import { buildReleaseClaimRequest } from "./release-claim-check";

test("turns highlights + customer lines into claims to review", () => {
  const ctx: any = { body: "notes", prs: [{ number: 1, title: "t", url: "u" }] };
  const plan: any = { highlights: [{ title: "X", value_line: "Cuts onboarding 40%", source_pr: "u" }], what_to_tell_customers: ["Now SOC2 compliant"] };
  const req = buildReleaseClaimRequest(ctx, plan);
  expect(req.claims.map((c) => c.text)).toContain("Cuts onboarding 40%");
  expect(req.claims.map((c) => c.text)).toContain("Now SOC2 compliant");
  expect(req.notes).toBe("notes");
});
```

- [ ] **Step 2: Run test to verify it fails** — FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { ReleaseContext } from "../ingest/release-context";
import type { ReleasePlan } from "../content-director/release-plan-schema";

export function buildReleaseClaimRequest(ctx: ReleaseContext, plan: ReleasePlan) {
  const claims: { id: string; text: string }[] = [];
  plan.highlights.forEach((h, i) => claims.push({ id: `h${i}`, text: h.value_line }));
  plan.what_to_tell_customers.forEach((t, i) => claims.push({ id: `c${i}`, text: t }));
  return { notes: ctx.body, prs: ctx.prs, claims };
}
```

- [ ] **Step 4: Run tests to verify they pass** — PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat: release claim-check request builder"`

---

## Task 5: Release one-pager renderer

**Files:**
- Create: `src/onepager/render-release-html.ts`
- Test: `src/onepager/render-release-html.test.ts`

**Interfaces:**
- Consumes: `ReleasePlan` (Task 2), `BrandTokens` (`../brand/token-resolver`), `escapeHtml` (`../compose/scene-card`).
- Produces: `renderReleaseOnePagerHtml(plan: ReleasePlan, t: BrandTokens, opts?: { logoRelPath?; notesUrl? }): string` — a single self-contained HTML page: branded band (product + version + theme), highlights grouped by `group` with persona chips, a compact long-tail list, a "What to tell customers" block, footer with the notes link. No video.

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "bun:test";
import { renderReleaseOnePagerHtml } from "./render-release-html";

const t: any = { orange: "#FA4616", teal: "#0BA2B3", deepBlue: "#182126", white: "#FFF", fontHeadline: "Poppins", fontBody: "Inter" };
const plan: any = {
  release_name: "FinS", version: "v2604.195.0", theme: "Faster onboarding", audience: "internal",
  highlights: [{ title: "Public apps", value_line: "Share apps by URL", persona: "Ops", group: "New capabilities", source_pr: "https://x/pull/1" }],
  long_tail: [{ title: "Nit fix", source_pr: "https://x/pull/2" }],
  what_to_tell_customers: ["Lead with time-to-value."],
  notes_url: "https://x/releases/tag/v2604.195.0",
};

test("renders version, theme, highlights, and no video", () => {
  const h = renderReleaseOnePagerHtml(plan, t);
  expect(h).toContain("v2604.195.0");
  expect(h).toContain("Public apps");
  expect(h).toContain("New capabilities");
  expect(h).toContain("Lead with time-to-value.");
  expect(h).not.toContain("Watch the");
  expect(h).not.toContain("data:image/png");
});

test("escapes injected text", () => {
  const h = renderReleaseOnePagerHtml({ ...plan, theme: "<script>x</script>" }, t);
  expect(h).not.toContain("<script>x</script>");
  expect(h).toContain("&lt;script&gt;");
});
```

- [ ] **Step 2: Run test to verify it fails** — FAIL.

- [ ] **Step 3: Write minimal implementation** — model the structure on `render-html.ts`; group highlights by `group`, escape every interpolated string. (Full template: reuse the `.band/.body/.cols/.position` CSS idiom from `render-html.ts`; render each group as a section with an `<ul>` of highlights showing `title` (bold), `value_line` (muted), and a persona chip; render `long_tail` as a compact comma list; render `what_to_tell_customers` as the orange-accent block; footer links `notes_url`.) Every dynamic value passes through `escapeHtml`.

- [ ] **Step 4: Run tests to verify they pass** — PASS. Then snapshot one frame via headless Chrome (`render` util is not needed — this is static HTML; open in a browser or `htmlToPdf`) to eyeball it once.

- [ ] **Step 5: Commit** — `git commit -m "feat: release one-pager renderer (multi-highlight, no video)"`

---

## Task 6: Digest renderer (Slack + Confluence)

**Files:**
- Create: `src/release/build-digest.ts`
- Test: `src/release/build-digest.test.ts`

**Interfaces:**
- Consumes: `ReleasePlan` (Task 2).
- Produces: `buildDigest(plan, opts?: { onepagerUrl? }): { slackMarkdown: string; confluenceHtml: string }`.

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "bun:test";
import { buildDigest } from "./build-digest";

const plan: any = {
  release_name: "FinS", version: "v2604.195.0", theme: "Faster onboarding", audience: "internal",
  highlights: [{ title: "Public apps", value_line: "Share apps by URL", persona: "Ops", group: "New capabilities", source_pr: "https://x/pull/1" }],
  long_tail: [], what_to_tell_customers: ["Lead with time-to-value."],
  notes_url: "https://x/releases/tag/v2604.195.0",
};

test("slack digest names the release and top highlight", () => {
  const d = buildDigest(plan, { onepagerUrl: "https://bucket/op.pdf" });
  expect(d.slackMarkdown).toContain("v2604.195.0");
  expect(d.slackMarkdown).toContain("Public apps");
  expect(d.slackMarkdown).toContain("https://bucket/op.pdf");
});

test("confluence html escapes and includes highlights", () => {
  const d = buildDigest({ ...plan, theme: "<b>x</b>" });
  expect(d.confluenceHtml).toContain("&lt;b&gt;");
  expect(d.confluenceHtml).toContain("Public apps");
});
```

- [ ] **Step 2: Run test to verify it fails** — FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { ReleasePlan } from "../content-director/release-plan-schema";
import { escapeHtml } from "../compose/scene-card";

export function buildDigest(plan: ReleasePlan, opts: { onepagerUrl?: string } = {}): { slackMarkdown: string; confluenceHtml: string } {
  const top = plan.highlights.slice(0, 5);
  const slackMarkdown = [
    `*${plan.release_name} ${plan.version} is out* — ${plan.theme}`,
    ...top.map((h) => `• *${h.title}* — ${h.value_line} _(for ${h.persona})_`),
    plan.what_to_tell_customers.length ? `\n*What to tell customers:* ${plan.what_to_tell_customers.join(" ")}` : "",
    opts.onepagerUrl ? `\n📄 One-pager: ${opts.onepagerUrl}` : "",
    `🔗 Full notes: ${plan.notes_url}`,
  ].filter(Boolean).join("\n");

  const li = (s: string) => `<li>${escapeHtml(s)}</li>`;
  const confluenceHtml = [
    `<h1>${escapeHtml(plan.release_name)} ${escapeHtml(plan.version)}</h1>`,
    `<p><em>${escapeHtml(plan.theme)}</em></p>`,
    `<h2>Highlights</h2><ul>`,
    ...top.map((h) => li(`${h.title} — ${h.value_line} (for ${h.persona})`)),
    `</ul>`,
    plan.what_to_tell_customers.length ? `<h2>What to tell customers</h2><ul>${plan.what_to_tell_customers.map(li).join("")}</ul>` : "",
    `<p><a href="${escapeHtml(plan.notes_url)}">Full release notes</a></p>`,
  ].join("");
  return { slackMarkdown, confluenceHtml };
}
```

- [ ] **Step 4: Run tests to verify they pass** — PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat: release digest renderer (Slack + Confluence)"`

---

## Task 7: `buildRelease` orchestrator + CLI

**Files:**
- Create: `src/pipeline/build-release.ts`
- Test: `src/pipeline/build-release.test.ts`

**Interfaces:**
- Consumes: `ReleaseContext` (Task 3), `ReleasePlan` (Task 2), `renderReleaseOnePagerHtml` (Task 5), `buildDigest` (Task 6), `loadBrandTokens`, `htmlToPdf` (`../onepager/to-pdf`).
- Produces: `buildRelease(plan: ReleasePlan, outDir: string): { onepagerHtml: string; onepagerPdf: string | null; slackPath: string; confluencePath: string }` — writes `onepager.html`, best-effort `onepager.pdf`, `digest.slack.md`, `digest.confluence.html` into `outDir`. Validates the plan first. Pure filesystem output; no UiPath.

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRelease } from "./build-release";

const plan: any = {
  release_name: "FinS", version: "v2604.195.0", theme: "Faster onboarding", audience: "internal",
  highlights: [{ title: "Public apps", value_line: "Share apps by URL", persona: "Ops", group: "New capabilities", source_pr: "https://x/pull/1" }],
  long_tail: [], what_to_tell_customers: ["Lead with time-to-value."],
  notes_url: "https://x/releases/tag/v2604.195.0",
};

test("writes one-pager html + both digests", () => {
  const dir = mkdtempSync(join(tmpdir(), "rel-"));
  const r = buildRelease(plan, dir);
  expect(readFileSync(r.onepagerHtml, "utf8")).toContain("v2604.195.0");
  expect(readFileSync(r.slackPath, "utf8")).toContain("Public apps");
  expect(readFileSync(r.confluencePath, "utf8")).toContain("Highlights");
});

test("rejects an invalid plan", () => {
  const dir = mkdtempSync(join(tmpdir(), "rel-"));
  expect(() => buildRelease({ ...plan, highlights: [] }, dir)).toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails** — FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateReleasePlan, type ReleasePlan } from "../content-director/release-plan-schema";
import { renderReleaseOnePagerHtml } from "../onepager/render-release-html";
import { buildDigest } from "../release/build-digest";
import { loadBrandTokens } from "../brand/token-resolver";
import { htmlToPdf } from "../onepager/to-pdf";

export function buildRelease(planInput: ReleasePlan, outDir: string) {
  const plan = validateReleasePlan(planInput);
  outDir = resolve(outDir);
  mkdirSync(outDir, { recursive: true });
  const t = loadBrandTokens();
  const onepagerHtml = join(outDir, "onepager.html");
  writeFileSync(onepagerHtml, renderReleaseOnePagerHtml(plan, t, { notesUrl: plan.notes_url }));
  const pdfCand = join(outDir, "onepager.pdf");
  const onepagerPdf = htmlToPdf(onepagerHtml, pdfCand) ? pdfCand : null;
  const digest = buildDigest(plan);
  const slackPath = join(outDir, "digest.slack.md");
  const confluencePath = join(outDir, "digest.confluence.html");
  writeFileSync(slackPath, digest.slackMarkdown);
  writeFileSync(confluencePath, digest.confluenceHtml);
  return { onepagerHtml, onepagerPdf, slackPath, confluencePath };
}

if (import.meta.main) {
  const planPath = process.argv[2];
  const plan = validateReleasePlan(JSON.parse(require("node:fs").readFileSync(planPath, "utf8")));
  const r = buildRelease(plan, join(process.cwd(), "out/release"));
  console.log("Release one-pager:", r.onepagerHtml, "| digest:", r.slackPath);
}
```

- [ ] **Step 4: Run tests to verify they pass** — PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat: buildRelease orchestrator + CLI"`

---

## Task 8: Agent `Platform` port + `FakePlatform`

**Files:**
- Create: `agent/platform.py`
- Test: `agent/test_orchestrator.py` (Task 9 uses it; the fake is exercised there)

**Interfaces:**
- Produces a `Platform` Protocol the orchestrator depends on — every UiPath touch point, so the orchestration logic never imports the SDK directly:

- [ ] **Step 1: Write the port + fake**

```python
# agent/platform.py
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Protocol, Optional

@dataclass
class ReleaseNotes: name: str; body: str

class Platform(Protocol):
    # ingest
    def get_pr(self, url: str) -> dict: ...
    def get_jira(self, key: str) -> dict: ...
    def get_release(self, owner: str, repo: str, tag: str) -> ReleaseNotes: ...
    # render (invokes the TS pipeline as an Orchestrator process)
    def invoke_render(self, kind: str, plan: dict) -> dict: ...   # returns {video_url?, onepager_url, digest?}
    # storage + entity
    def storage_put(self, local_path: str, key: str) -> str: ...  # returns URL
    def entity_create(self, record: dict) -> str: ...             # returns entity id
    def entity_update(self, entity_id: str, patch: dict) -> None: ...
    # human gate
    def raise_approval(self, entity_id: str, summary: dict) -> "Approval": ...
    # publish
    def publish(self, channels: list[str], payload: dict) -> list[str]: ...  # returns published channels

@dataclass
class Approval: status: str; approved_by: str = ""; channels: list[str] = field(default_factory=list); note: str = ""

class FakePlatform:
    """In-memory Platform for tests; records calls, returns canned data."""
    def __init__(self, approval: Approval | None = None):
        self.entities: dict[str, dict] = {}; self.published: list[str] = []
        self._approval = approval or Approval(status="approved", approved_by="tester", channels=["slack"])
        self._id = 0
    def get_pr(self, url): return {"diff": "d", "commits": ["c"], "title": "t", "body": "b", "url": url}
    def get_jira(self, key): return {"key": key, "summary": "s", "acceptance": "a"}
    def get_release(self, owner, repo, tag): return ReleaseNotes(name=f"{repo} {tag}", body="* T by @a in https://github.com/o/r/pull/1")
    def invoke_render(self, kind, plan): return {"onepager_url": "file:///op.pdf", **({"video_url": "file:///v.mp4"} if kind == "feature" else {"digest": {"slack": "s"}})}
    def storage_put(self, local_path, key): return f"https://bucket/{key}"
    def entity_create(self, record): self._id += 1; eid = f"e{self._id}"; self.entities[eid] = dict(record); return eid
    def entity_update(self, entity_id, patch): self.entities[entity_id].update(patch)
    def raise_approval(self, entity_id, summary): return self._approval
    def publish(self, channels, payload): self.published += channels; return channels
```

- [ ] **Step 2: Commit** — `git commit -m "feat(agent): Platform port + FakePlatform"`

---

## Task 9: Orchestrator logic (tested against the fake)

**Files:**
- Create: `agent/orchestrator.py`
- Test: `agent/test_orchestrator.py`

**Interfaces:**
- Consumes: `Platform`, `Approval` (Task 8); a `classify(url) -> str` mirroring Task 1 (kept in parity by Task 10).
- Produces: `run(source_url, custom_prompt, platform, brain, classify) -> AssetRecord` where `brain` authors the plan + returns claim-check status. The flow: classify → ingest → brain authors plan (+claim-check) → invoke_render → storage_put media → entity_create → raise_approval → (on approve) publish → entity_update. **Never publishes on `rejected`, on a `high` claim flag, or on `regenerate`.**

- [ ] **Step 1: Write the failing test**

```python
# agent/test_orchestrator.py
from agent.platform import FakePlatform, Approval
from agent.orchestrator import run

class FakeBrain:
    def author(self, kind, ctx, custom_prompt):
        return ({"feature_name": "X"} if kind == "feature" else {"version": "v1"}, "reviewed")  # (plan, claim_status)

def classify(url): return "release" if "/releases/" in url else "feature"

def test_release_path_publishes_onepager_and_digest_no_video():
    p = FakePlatform(Approval(status="approved", approved_by="t", channels=["slack", "confluence"]))
    rec = run("https://github.com/o/r/releases/tag/v1", None, p, FakeBrain(), classify)
    assert rec["type"] == "release"
    assert rec["video_url"] is None
    assert set(p.published) == {"slack", "confluence"}
    assert p.entities[rec["entity_id"]]["approval_status"] == "approved"

def test_high_claim_flag_blocks_publish():
    class Flagging(FakeBrain):
        def author(self, kind, ctx, cp): return ({"version": "v1"}, "flags")
    p = FakePlatform()
    rec = run("https://github.com/o/r/releases/tag/v1", None, p, Flagging(), classify)
    assert p.published == []
    assert rec["claim_check_status"] == "flags"

def test_rejected_approval_does_not_publish():
    p = FakePlatform(Approval(status="rejected", approved_by="t"))
    run("https://github.com/o/r/pull/5", None, p, FakeBrain(), classify)
    assert p.published == []
```

- [ ] **Step 2: Run test to verify it fails** — `cd agent && python -m pytest test_orchestrator.py` → FAIL.

- [ ] **Step 3: Write minimal implementation**

```python
# agent/orchestrator.py
from __future__ import annotations
from .platform import Platform, Approval

def run(source_url: str, custom_prompt, platform: Platform, brain, classify) -> dict:
    kind = classify(source_url)
    if kind == "unknown":
        raise ValueError(f"Unrecognized source URL: {source_url}")

    # 1. ingest
    if kind == "feature":
        ctx = {"pr": platform.get_pr(source_url)}
    else:
        from urllib.parse import urlparse
        parts = urlparse(source_url).path.strip("/").split("/")
        owner, repo, tag = parts[0], parts[1], parts[-1]
        notes = platform.get_release(owner, repo, tag)
        ctx = {"release": {"owner": owner, "repo": repo, "tag": tag, "name": notes.name, "body": notes.body}}

    # 2. brain authors the plan + runs claim-check (grounded; custom_prompt = steering)
    plan, claim_status = brain.author(kind, ctx, custom_prompt)

    # 3. render (only this kind's artifacts)
    out = platform.invoke_render(kind, plan)

    # 4. store media in a bucket, metadata in the entity
    record = {
        "type": kind,
        "title": plan.get("feature_name") or f"Release {plan.get('version')}",
        "source_ref": source_url,
        "custom_prompt": custom_prompt or "",
        "video_url": out.get("video_url"),
        "onepager_url": out.get("onepager_url"),
        "digest_url": None,
        "qa_status": "passed",
        "claim_check_status": claim_status,
        "approval_status": "draft",
        "channels_published": "",
    }
    entity_id = platform.entity_create(record)
    record["entity_id"] = entity_id

    # 5. human gate — never auto-publish a high-severity claim flag
    if claim_status == "flags":
        platform.entity_update(entity_id, {"approval_status": "draft"})
        return record
    approval: Approval = platform.raise_approval(entity_id, {k: record[k] for k in ("title", "onepager_url", "video_url")})
    record["approval_status"] = approval.status
    platform.entity_update(entity_id, {"approval_status": approval.status, "approved_by": approval.approved_by})

    # 6. publish only on approval
    if approval.status == "approved":
        payload = {"kind": kind, "urls": {k: record[k] for k in ("onepager_url", "video_url")}}
        published = platform.publish(approval.channels, payload)
        record["channels_published"] = ",".join(published)
        platform.entity_update(entity_id, {"channels_published": record["channels_published"]})
    return record
```

- [ ] **Step 4: Run tests to verify they pass** — PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(agent): orchestrator flow (fake-tested)"`

---

## Task 10: Router parity test (Python ↔ TS)

**Files:**
- Create: `agent/router.py`, `agent/test_router_parity.py`

**Interfaces:**
- Produces: `classify(url) -> "feature"|"release"|"unknown"` — a Python port of Task 1's rules, kept byte-parity by a shared fixture list.

- [ ] **Step 1: Write the failing test** — assert `classify` matches Task 1's expectations on the same URLs (release tag/anchor → release; pull/commit → feature; else unknown).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement `classify` with the same regexes as Task 1.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(agent): URL router (TS parity)"`

---

## Task 11: Concrete UiPath `Platform` + `Brain` (tenant-wiring)

**Files:**
- Create: `agent/uipath_platform.py`, `agent/brain.py`, `agent/main.py`

**Interfaces:**
- Consumes: `Platform`/`Brain` Protocols. Produces concrete impls over the UiPath Agents SDK.

> This task binds to the live tenant; its methods are thin translations of the Task 8 port onto the UiPath SDK and cannot be unit-tested without the SDK + credentials. Fill each method from the **UiPath Agents SDK / uipath-python docs** for the installed SDK version. The contract for every method is fixed by the `Platform`/`Brain` Protocols above — implement to that contract exactly.

- [ ] **Step 1: `UiPathPlatform`** — implement each `Platform` method:
  - `get_pr` / `get_jira` / `get_release` → Integration Service connectors (GitHub, Jira).
  - `invoke_render(kind, plan)` → write `plan` to a Storage Bucket, `sdk.processes.invoke("amplify-render", {...})`, read artifacts back from the bucket, return their URLs.
  - `storage_put` → Storage Bucket upload; `entity_create/update` → Data Service entity CRUD on `EnablementAsset`.
  - `raise_approval` → Action Center task create + `agent.interrupt()`; map the returned action to `Approval`.
  - `publish` → Integration Service (Slack/Confluence/YouTube).
- [ ] **Step 2: `Brain`** — `author(kind, ctx, custom_prompt)`: call Claude via **AI Trust Layer** with the existing content-director/enablement-video skill instructions (feature) or the release-curation instructions (release) to author the plan; then run the claim-check request (`buildClaimRequest`/`buildReleaseClaimRequest` equivalents) and return `(plan, "reviewed"|"flags")`. **Custom prompt is appended as steering, never replacing grounding.**
- [ ] **Step 3: `main.py`** — coded-agent entry: read `source_url`, `custom_prompt` inputs → `run(...)` with `UiPathPlatform`, real `Brain`, `classify`.
- [ ] **Step 4: Deploy** — publish `amplify-render` (the TS pipeline) as an unattended Process (robot machine has Node/Bun/Chrome/FFmpeg); create the `EnablementAsset` Data Service entity (fields per spec); set up Integration Service connections; deploy the coded agent. Smoke-test with one real PR URL and one real release URL.
- [ ] **Step 5: Commit** — `git commit -m "feat(agent): UiPath Platform + Brain + entry point"`

---

## Self-Review

- **Spec coverage:** router (T1, T10), release schema (T2), release ingest (T3), release claim-check (T4), release one-pager (T5), digest (T6), buildRelease (T7), agent port/orchestrator/parity (T8–T10), UiPath wiring + entity + Action Center + publish (T11). ✔
- **Placeholder scan:** every TS task ships complete code + tests. T5's template references the existing `render-html.ts` idiom rather than repeating 120 lines — the implementer has the exact structure to follow. T11 is explicitly tenant-wiring against the SDK, bounded by the fixed `Platform`/`Brain` contracts (not an open-ended "figure it out").
- **Type consistency:** `ReleaseContext`, `ReleasePlan`, `Platform`, `Approval`, `classify` signatures match across tasks; the orchestrator's `record` keys match the `EnablementAsset` entity fields in the spec.

## Notes for the executor

- Phase 1 (T1–T7) is self-contained, fully testable, and demoable at finals **without a tenant** — do it first.
- T11 is the only tenant-dependent task; keep all UiPath SDK calls inside `uipath_platform.py`/`brain.py` so nothing else needs the SDK.
- Run `export HYPERFRAMES_NODE_BIN="$(dirname "$(nvm which stable)")"` before any render.
