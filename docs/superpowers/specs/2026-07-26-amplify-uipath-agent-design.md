# Amplify on UiPath — Agents SDK Deployment + Release Enablement (Design Spec)

**Status:** Draft for review · **Date:** 2026-07-26 · **Author:** Rakshith Hegde (+ team)

## Goal

Run Amplify as a **UiPath coded agent (Agents SDK, Python)** deployed to an Automation
Cloud tenant, exposed as a **Process** that takes inputs (a PR + Jira ticket, or a GitHub
Release, plus an optional custom prompt), generates the enablement artifacts through the
**existing render pipeline unchanged**, stores every asset in a **Data Service entity**,
and routes drafts to a human via **Action Center** before publishing.

Add a second entry point: **Release Enablement** — turn a GitHub Release into a humanized
one-pager + a digest post so the field/customers know what shipped and why it matters.

**Non-goal / guardrail:** the agent is an *orchestration wrapper*. It does not re-author or
re-render anything. The content director (Claude authoring the VideoPlan) and the render
pipeline are byte-for-byte the current implementation, so output quality is unchanged.

## What exists today (reused as-is)

- Content director (Claude authors VideoPlan v3) + camera director (auto-zoom).
- Render pipeline: `buildFromPlan` / `buildFromBranch` (TS/Bun + headless Chrome + FFmpeg):
  VO + ducked music + SFX + captions, compositor, QA lint/validate, **claim-check gate**.
- One-pager renderer (`src/onepager/render-html.ts`, single-page, objection-handling).
- Ingest primitives: `getPrContext` (git/PR), `manual-prompt`.

## Architecture

One coded agent orchestrates the same pipeline. Two entry points, one spine.

```
Trigger (GitHub merge OR release published)
   │  Process inputs: { source_url, custom_prompt?, mode_override? }
   ▼
Router — classify source_url → "feature" | "release" (mode_override wins if set)
   ▼
Coded Agent (Python · Agents SDK) — the brain / orchestrator
  1. Ingest    Integration Service → GitHub + Jira    (feature: PR+Jira | release: Release+PR list)
  2. Brain     Claude via UiPath AI Trust Layer → plan + claim-check   [UNCHANGED logic]
  3. Render    sdk.processes.invoke("amplify-render"); plan in / artifacts out via Storage Buckets
  4. Store     write Data Service entity row; media → Storage Bucket (entity holds URLs)
  5. Approve   raise Action Center task → agent.interrupt() → human approves/rejects/sends-back/picks-channels
  6. Publish   on approval → Slack / Confluence / (YouTube optional) via Integration Service
```

**UiPath products used:** Agents SDK (brain), Orchestrator (runs render process, schedules/logs),
Storage Buckets (plan + media transport), Data Service (asset entity), Action Center (human gate),
Integration Service (GitHub/Jira/Slack/Confluence/YouTube), AI Trust Layer (Claude — no personal key).

## Input detection / router

The process takes a single **`source_url`** and classifies it — no manual mode needed:

- `…/releases/tag/<tag>`, `…/releases#release-<tag>`, or a bare release tag ref → **`release`**
- `…/pull/<n>`, a merge commit, or a branch ref → **`feature`**
- `mode_override` (optional) wins if the URL is ambiguous.

Each path emits **only its own artifacts** — feature → video + one-pager (no digest);
release → one-pager + digest (no video). The router is a small, pure, unit-tested function.

## Entry points

### A. `feature` (existing behavior, now agent-driven)
Input: a merged PR (diff, commits, title, body) + linked Jira key + optional custom prompt.
Output: enablement **video + one-pager**. Human gate before publish.

### B. `release` (new)
Input: a GitHub Release (e.g. `fins-vertical-solution` `v2604.195.0`) + optional custom prompt.
Output: a **humanized one-pager + a digest post** (Slack + Confluence). **Internal-enablement
first** cut. **No release video** (out of scope for finals).

Ingest for a release:
1. Fetch the release (GitHub Releases API): tag, name, body (auto-generated notes).
2. Resolve the change set: compare previous tag → this tag (`/compare/{base}...{head}`) → commits →
   associated PRs. Fast path: parse the release body's "What's Changed" PR list.
3. Optionally enrich each PR with its linked Jira (customer ask / acceptance criteria).

**Curation (the one genuinely new brain task):** the content director clusters and *ranks* the
change set, selects the top ~4–6 highlights worth featuring, groups them
(New capabilities / Improvements / Fixes that matter), and summarizes the long tail compactly.
Grounded in the notes/PRs — **claim-check still applies** (won't overstate a note the diff doesn't support).

Release plan shape (feeds the one-pager + digest renderers):
```
release_name, version, theme, audience: "internal",
highlights[]: { title, value_line, persona, group, source_pr, jira_key? },
long_tail[]: { title, source_pr },
what_to_tell_customers[], notes_url
```

## Data model — Data Service entity `EnablementAsset`

One row per generated draft (feature or release). The auditable library the user asked for.

| Field | Type | Notes |
|---|---|---|
| `type` | choice | `feature` \| `release` |
| `title` | text | feature name or "Release <version>" |
| `source_ref` | text | PR URL or release tag URL |
| `jira_key` | text | optional (feature) |
| `custom_prompt` | text | optional steering input |
| `video_url` | text | Storage Bucket URL (feature only) |
| `onepager_url` | text | Storage Bucket URL |
| `digest_url` | text | Confluence page URL (release) |
| `qa_status` | choice | `passed` \| `issues` |
| `claim_check_status` | choice | `reviewed` \| `flags` |
| `approval_status` | choice | `draft` \| `approved` \| `rejected` \| `regenerate` |
| `channels_published` | text | e.g. "slack,confluence" |
| `created_at` | datetime | |
| `approved_by` | text | Action Center actor |

**Media pattern:** the ~20 MB mp4 / PDF live in a **Storage Bucket**; the entity holds their
URLs (Data Service file fields are too small). Non-negotiable for the video.

## Custom prompt = steering, not override

Optional process input that layers emphasis on top of PR/Jira/release grounding
("lead with the compliance angle", "target FSI"). It can shape the angle but never replaces the
source facts, and everything still passes claim-check. Not a fallback, not a fact override.

## Quality preservation (the user's explicit concern)

Steps 2–3 are the current pipeline verbatim: same Claude prompt/skill authoring the same
VideoPlan v3 from the same context, same deterministic render, same claim-check. The agent only
does plumbing (ingest, invoke, store, gate, publish). Given identical inputs, the video is identical.

## Render execution (main integration risk)

The render is Node/Bun + headless Chrome + FFmpeg. It runs as a dedicated **unattended Process**
(`amplify-render`) the agent invokes via `sdk.processes.invoke`; plan in / artifacts out via
Storage Buckets. The robot machine must have Node/Bun/Chrome/FFmpeg installed.

**Fallback if that setup is heavy for finals:** run the render on a machine you control that the
agent calls; everything else (ingest, brain, entity, Action Center, publish) stays on-platform, so
the agentic story is intact. (Release path avoids this entirely — one-pager + digest are HTML/PDF,
no video render.)

## Credentials / keys

- **UiPath**: External Application (OAuth) client id + secret (or PAT) + tenant URL, scoped for
  Orchestrator, Data Service, Action Center, Storage Buckets, Integration Service, AI Trust Layer.
- **Integration Service connections** (creds held by the connection, not in code): GitHub, Jira,
  Slack, Confluence, YouTube (optional).
- **No standalone Anthropic key** — Claude via AI Trust Layer. **ElevenLabs** optional (premium voice; else system TTS).

## Error handling

- Ingest failure (PR/Jira/release not found) → fail the process with a clear message; no entity row.
- Brain/claim-check `flags` → still produce the draft, set `claim_check_status=flags`, and surface
  the flags in the Action Center task for human adjudication (never auto-publish a flagged draft).
- Render failure → mark the entity `qa_status=issues`, attach logs, still raise the human task.
- Publish failure on one channel → record partial `channels_published`, don't roll back approval.

## Phasing (finals-oriented build order)

1. **Agent skeleton + entity** — coded agent scaffold, Data Service `EnablementAsset`, write a row.
2. **Feature path on-platform** — ingest (GitHub+Jira) → brain (AI Trust Layer) → invoke render →
   store → Action Center gate → Slack publish.
3. **Release path** — release ingest + curation → humanized one-pager + digest → store → gate → publish.
4. **Polish** — Confluence publish, YouTube (optional), regenerate-with-note loop.

## Open items

- Confirm which Claude models the tenant's AI Trust Layer exposes.
- Confirm the render robot machine can host Node/Bun/Chrome/FFmpeg (else use the fallback).
- Release one-pager: adapt the existing single-feature renderer to a multi-highlight template.
