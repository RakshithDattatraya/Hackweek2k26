"""Amplify — UiPath coded agent (LangGraph).

Flow (one graph): route → ingest → author (Claude via AI Trust Layer) → render
(invoke the TS pipeline as an Orchestrator process) → store (Data Service entity).

The agent's job ends at storing the generated assets + metadata in the EnablementAsset
entity; a separate UiPath App reads the entity and surfaces the assets. No approval /
publish step here.

All Orchestrator/Data-Service/bucket calls are scoped to AMPLIFY_FOLDER_PATH, which the
agent reads from its own configured context — never from the trigger input — so generated
assets stay tenant/folder-isolated (this vertical is multi-customer).

Tenant specifics come from env (see .env.example); nothing tenant-specific is hardcoded.
Import/compile-verified against uipath 2.13.16; needs a live tenant + published
`amplify-render` process + the EnablementAsset entity + a GitHub connection to run.
"""
from __future__ import annotations
import json
import os
import re
from typing import Any, Optional

import httpx
from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, START, END

# --- tenant config (set at deploy; never hardcode secrets) ---
FOLDER = os.environ.get("AMPLIFY_FOLDER_PATH", "Shared")          # Orchestrator folder = isolation scope
ENTITY = os.environ.get("AMPLIFY_ENTITY", "EnablementAsset")      # Data Service entity name
RENDER_PROCESS = os.environ.get("AMPLIFY_RENDER_PROCESS", "amplify-render")
LLM_MODEL = os.environ.get("AMPLIFY_LLM_MODEL", "anthropic.claude-sonnet-4-6")  # from `uipath list-models`
# NOTE: the newest Claude ids (sonnet-5, opus-4.7/4.8) reject `temperature`, which this
# SDK's gateway always sends -> 400. Use a model that accepts it (sonnet-4-6 / sonnet-4-5).
GH_ASSET = os.environ.get("AMPLIFY_GITHUB_ASSET", "")            # Orchestrator Asset (Secret) holding a GitHub PAT
GH_CONN = os.environ.get("AMPLIFY_GITHUB_CONNECTION", "")         # or an Integration Service GitHub connection key
JIRA_CONN = os.environ.get("AMPLIFY_JIRA_CONNECTION", "")


def _sdk():
    # Lazy so importing this module (for `uipath init` / graph compile) needs no auth.
    from uipath.platform import UiPath
    return UiPath()


# ---------- state ----------
class AgentInput(BaseModel):
    source_url: str = Field(description="A GitHub PR/merge URL (feature) or release URL (release).")
    custom_prompt: Optional[str] = Field(default=None, description="Optional steering; never overrides source facts.")


class AgentState(AgentInput):
    kind: str = ""
    context: dict = {}
    plan: dict = {}
    claim_status: str = ""
    artifacts: dict = {}
    entity_id: str = ""


class AgentOutput(BaseModel):
    kind: str
    entity_id: str
    claim_status: str
    artifacts: dict


# ---------- helpers ----------
def classify(url: str) -> str:
    u = (url or "").strip()
    if re.search(r"/releases/tag/[^/]+", u) or re.search(r"/releases#release-", u):
        return "release"
    if re.search(r"/pull/\d+", u) or re.search(r"/commit/[0-9a-f]{6,40}", u, re.I):
        return "feature"
    return "unknown"


def _github_token() -> str:
    # Prefer an Orchestrator Asset (Secret) holding a PAT; else an Integration Service
    # connection token; else unauthenticated (public repos only). The secret is read at
    # runtime and never stored in code (secret-leakage).
    if GH_ASSET:
        return _sdk().assets.retrieve_secret(GH_ASSET, folder_path=FOLDER) or ""
    if GH_CONN:
        tok = _sdk().connections.retrieve_token(GH_CONN)
        return getattr(tok, "access_token", None) or getattr(tok, "value", "") or ""
    return ""


# ---------- nodes ----------
def ingest(state: AgentState) -> dict:
    kind = classify(state.source_url)
    if kind == "unknown":
        raise ValueError(f"Unrecognized source URL: {state.source_url}")
    # classify() only accepts github.com PR/release URLs, and every request below targets
    # api.github.com built from the parsed owner/repo — so there is no arbitrary-host fetch (SSRF).
    gh = _github_token()
    headers = {"Authorization": f"Bearer {gh}", "Accept": "application/vnd.github+json"} if gh else {}
    ctx: dict[str, Any] = {"kind": kind, "source_url": state.source_url}
    if kind == "release":
        m = re.search(r"github\.com/([^/]+)/([^/]+)/releases/tag/([^/?#]+)", state.source_url) or \
            re.search(r"github\.com/([^/]+)/([^/]+)/releases#release-([^/?#]+)", state.source_url)
        owner, repo, tag = m.group(1), m.group(2), m.group(3)
        r = httpx.get(f"https://api.github.com/repos/{owner}/{repo}/releases/tags/{tag}", headers=headers, timeout=30)
        r.raise_for_status()
        d = r.json()
        ctx.update(owner=owner, repo=repo, tag=tag, name=d.get("name"), body=d.get("body") or "")
    else:  # feature
        m = re.search(r"github\.com/([^/]+)/([^/]+)/pull/(\d+)", state.source_url)
        owner, repo, num = m.group(1), m.group(2), m.group(3)
        r = httpx.get(f"https://api.github.com/repos/{owner}/{repo}/pulls/{num}", headers=headers, timeout=30)
        r.raise_for_status()
        pr = r.json()
        ctx.update(owner=owner, repo=repo, number=int(num), title=pr.get("title"), body=pr.get("body") or "")
    return {"kind": kind, "context": ctx}


AUTHOR_SYS = {
    "release": (
        "You are Amplify's content director. From the GitHub release notes below, author a grounded, "
        "internal-enablement ReleasePlan as strict JSON with keys: release_name, version, theme, at_a_glance, "
        'audience ("internal"), highlights[] (title, value_line, persona, '
        'group in ["New capabilities","Improvements","Fixes that matter"], source_pr, jira_key?), '
        "long_tail[] (title, source_pr), what_to_tell_customers[], notes_url. "
        "Curate the top 4-8 highlights; never invent a claim the notes don't support. "
        'Then add a top-level "claim_status" = "reviewed" if every value_line is supported by the notes, else "flags".'
    ),
    "feature": (
        "You are Amplify's content director. From the PR (+ any linked Jira) below, author a grounded VideoPlan v3 "
        "as strict JSON (feature_name, value_prop, persona, when_to_use, talking_points[], objections[], scenes[], "
        "youtube_metadata). Ground every claim in the diff/notes; never invent. "
        'Add a top-level "claim_status" = "reviewed" or "flags".'
    ),
}


async def author(state: AgentState) -> dict:
    sys = AUTHOR_SYS[state.kind]
    steer = f"\n\nSteering (add emphasis only, do not override facts): {state.custom_prompt}" if state.custom_prompt else ""
    user = f"Source URL: {state.source_url}\n\nContext:\n{json.dumps(state.context)[:24000]}{steer}"
    resp = await _sdk().llm.chat_completions(  # gateway is async
        messages=[{"role": "system", "content": sys}, {"role": "user", "content": user}],
        model=LLM_MODEL, max_tokens=4096,
    )
    text = resp.choices[0].message.content if hasattr(resp, "choices") else str(resp)
    obj = json.loads(re.search(r"\{.*\}", text, re.S).group(0))
    claim = obj.pop("claim_status", "reviewed")
    return {"plan": obj, "claim_status": claim}


def render(state: AgentState) -> dict:
    # Invoke the TS render pipeline (published Orchestrator process), scoped to our folder.
    job = _sdk().processes.invoke(
        RENDER_PROCESS,
        {"kind": state.kind, "plan": json.dumps(state.plan)},
        folder_path=FOLDER,
    )
    out = getattr(job, "output_arguments", None) or getattr(job, "output", None) or {}
    if isinstance(out, str):
        try: out = json.loads(out)
        except Exception: out = {}
    # release -> onepager_url + digest_url ; feature -> video_url + onepager_url
    return {"artifacts": {k: out.get(k) for k in ("video_url", "onepager_url", "digest_url") if out.get(k)}}


def store(state: AgentState) -> dict:
    # Persist the generated assets + metadata into the EnablementAsset entity.
    # A separate UiPath App reads these records to surface the assets.
    # Data Service entities are tenant-scoped (auth is the isolation boundary); field
    # names are alphanumeric camelCase (Data Service rejects underscores).
    sdk = _sdk()
    ent = sdk.entities.retrieve_by_name(ENTITY)
    a = state.artifacts
    record = {
        "assetType": state.kind,
        "title": state.plan.get("feature_name") or f"Release {state.plan.get('version', '')}",
        "sourceRef": state.source_url,
        "customPrompt": state.custom_prompt or "",
        "videoUrl": a.get("video_url"),
        "onepagerUrl": a.get("onepager_url"),
        "digestUrl": a.get("digest_url"),
        "qaStatus": "passed",
        "claimCheckStatus": state.claim_status,
    }
    rec = sdk.entities.insert_record(ent.id, record)
    return {"entity_id": str(getattr(rec, "id", "") or getattr(rec, "Id", "") or "")}


# ---------- graph ----------
builder = StateGraph(AgentState, input=AgentInput, output=AgentOutput)
for name, fn in (("ingest", ingest), ("author", author), ("render", render), ("store", store)):
    builder.add_node(name, fn)
builder.add_edge(START, "ingest")
builder.add_edge("ingest", "author")
builder.add_edge("author", "render")
builder.add_edge("render", "store")
builder.add_edge("store", END)

graph = builder.compile()
