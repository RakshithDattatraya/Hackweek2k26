"""SKELETON — tenant-wiring required; not runnable until the TODO(tenant) markers are filled
against the UiPath Agents SDK. Contracts are fixed by agent/platform.py.

`Brain` is the tenant-side stand-in for the "content director" step in
orchestrator.run(): given ingest context (`ctx`), it calls Claude via UiPath's AI Trust
Layer (no standalone Anthropic key — see design spec §Credentials) using the *existing,
unchanged* enablement-video skill instructions (feature path) or the release-curation
instructions (release path, new — clusters/ranks the change set into highlights per
docs/superpowers/specs/2026-07-26-amplify-uipath-agent-design.md), then runs the
claim-check gate against the authored plan and returns the (plan, status) tuple that
orchestrator.run() consumes at `plan, claim_status = brain.author(kind, ctx, custom_prompt)`.

Non-goal / guardrail (per CLAUDE.md + the design spec): this class must not re-derive
its own narrative logic — it is a thin AI-Trust-Layer call using the same prompts/skill
content as the current TS content director (src/content-director/content-director.ts)
and the same claim-check request builders (src/qa/claim-check.ts buildClaimRequest,
src/qa/release-claim-check.ts buildReleaseClaimRequest), so output is unchanged for
identical inputs.
"""
from __future__ import annotations


class Brain:
    """Concrete brain: authors a plan via Claude (AI Trust Layer) + runs claim-check.

    Construction is expected to take whatever the AI Trust Layer client needs (tenant
    scope, model id/alias the tenant exposes — see design spec "Open items": confirm
    which Claude models the tenant's AI Trust Layer exposes).
    """

    def __init__(self, *args, **kwargs):
        # self._ai = sdk.ai_trust_layer  # or uipath.llm.get_client(scope=...)
        # self._feature_skill = load_skill_instructions("enablement-video")       # unchanged content director prompt
        # self._release_skill = load_skill_instructions("release-curation")      # new: cluster/rank change set
        raise NotImplementedError("TODO(tenant): wire Brain.__init__ to UiPath AI Trust Layer client bootstrap")

    def author(self, kind: str, ctx: dict, custom_prompt: str | None) -> tuple[dict, str]:
        """Author the video/release plan and run the claim-check gate.

        Maps to: Claude via UiPath **AI Trust Layer** — using the enablement-video skill
        instructions for kind == "feature" (unchanged content director: PR + Jira context ->
        VideoPlan v3, see src/content-director/content-director.ts generatePlan) or the
        release-curation instructions for kind == "release" (ReleaseNotes/PR list -> ranked
        highlights/long_tail, per the design spec's "Curation" section) — followed by the
        claim-check request/gate (buildClaimRequest + applyClaimGate for feature,
        buildReleaseClaimRequest equivalent for release, both in src/qa/*.ts).

        `custom_prompt`, if provided, is appended to the grounded PR/Jira/release context as
        steering emphasis only ("lead with the compliance angle", "target FSI") — it must
        never replace or override the source facts, and the authored plan still has to pass
        claim-check against the same grounding (per design spec "Custom prompt = steering,
        not override").

        Return contract (consumed by agent/orchestrator.py `run()`):
            tuple[dict, str] — (plan, claim_status)
            plan: for kind == "feature", a VideoPlan-v3-shaped dict with at least
                  feature_name, value_prop, persona, when_to_use, talking_points[],
                  narration_script, scenes[], youtube_metadata (see agent/platform.py
                  FakePlatform.invoke_render and CLAUDE.md §7 "Content director structured
                  output contract"); for kind == "release", a ReleasePlan-shaped dict with
                  at least release_name, version, theme, audience, highlights[], long_tail[],
                  what_to_tell_customers[], notes_url (per the design spec's "Release plan
                  shape").
            claim_status: "reviewed" if claim-check passed clean, "flags" if claim-check
                  raised findings (orchestrator.run() blocks auto-publish and keeps the
                  entity in approval_status="draft" when claim_status == "flags" — never
                  auto-publish a flagged draft, per design spec error handling).
        """
        # skill = self._feature_skill if kind == "feature" else self._release_skill
        # prompt = render_skill_prompt(skill, ctx=ctx, steering=custom_prompt)  # steering appended, never replacing grounding
        # response = self._ai.complete(model=<tenant AI Trust Layer model id>, prompt=prompt)
        # plan = parse_plan_json(response.text)  # VideoPlan v3 (feature) or ReleasePlan (release)
        #
        # if kind == "feature":
        #     claim_request = build_claim_request(prContext=ctx["pr"], scenes=plan["scenes"])
        # else:
        #     claim_request = build_release_claim_request(ctx["release"], plan)
        # gate_result = apply_claim_gate(claim_request)  # -> {"status": "reviewed"|"flags", "findings": [...]}
        # return plan, gate_result["status"]
        raise NotImplementedError("TODO(tenant): wire to UiPath AI Trust Layer")
