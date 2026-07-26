"""SKELETON — tenant-wiring required; not runnable until the TODO(tenant) markers are filled
against the UiPath Agents SDK. Contracts are fixed by agent/platform.py.

Coded-agent entry point (UiPath Agents SDK, Python). Reads the process inputs
(`source_url`, `custom_prompt`) and composes the already-tested pieces:
`classify` (agent/router.py, pure, unit-tested) -> `run` (agent/orchestrator.py, unit-tested
against FakePlatform/FakeBrain) -> the tenant-bound `UiPathPlatform` / `Brain` skeletons.

This file's composition logic is real — it is not itself a stub. It only fails at runtime
because `UiPathPlatform()` / `Brain()` raise NotImplementedError until their TODO(tenant)
markers are wired against the installed SDK (see agent/uipath_platform.py, agent/brain.py).

Per the design spec (docs/superpowers/specs/2026-07-26-amplify-uipath-agent-design.md),
the Process also accepts an optional `mode_override` which, if the SDK's coded-agent
input-binding exposes it, should be threaded through to `classify`/`run` the same way;
left out of the minimal signature below since agent/router.classify and
agent/orchestrator.run do not currently accept it (T1/T10 scope).
"""
from __future__ import annotations

from agent.orchestrator import run
from agent.router import classify
from agent.uipath_platform import UiPathPlatform
from agent.brain import Brain


def main(inputs: dict) -> dict:
    """Coded-agent entry point.

    Args:
        inputs: the Process's input arguments dict. Expected keys:
            "source_url" (str, required)   — PR/commit/branch URL (feature) or
                                              release tag URL (release); classify()
                                              routes on this.
            "custom_prompt" (str, optional) — steering only, never overrides grounding
                                              (see Brain.author docstring).

    Returns:
        The `record` dict produced by agent.orchestrator.run() — the same shape written
        to the EnablementAsset Data Service entity (title, source_ref, video_url,
        onepager_url, qa_status, claim_check_status, approval_status,
        channels_published, entity_id, ...).

    # TODO(tenant): the exact coded-agent entrypoint binding (decorator / function
    # signature / how `inputs` is supplied by the Agents SDK runtime) depends on the
    # installed SDK version — confirm against the UiPath Agents SDK / uipath-python docs
    # for this tenant and adapt the `inputs` extraction below if the binding differs
    # (e.g. typed input model instead of a raw dict).
    """
    source_url = inputs["source_url"]
    custom_prompt = inputs.get("custom_prompt")

    platform = UiPathPlatform()  # TODO(tenant): pass tenant URL / auth / bucket / entity config
    brain = Brain()              # TODO(tenant): pass AI Trust Layer scope / model id

    return run(source_url, custom_prompt, platform, brain, classify)


if __name__ == "__main__":
    # Local smoke-test shape only — real coded-agent input delivery is tenant/SDK-specific
    # (see TODO(tenant) above). This will raise NotImplementedError via UiPathPlatform()/
    # Brain() construction until those are wired; that is expected, not a bug in main().
    import sys

    _source_url = sys.argv[1] if len(sys.argv) > 1 else ""
    _custom_prompt = sys.argv[2] if len(sys.argv) > 2 else None
    main({"source_url": _source_url, "custom_prompt": _custom_prompt})
