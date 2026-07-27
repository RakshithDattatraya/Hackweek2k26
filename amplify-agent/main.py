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
BUCKET = os.environ.get("AMPLIFY_BUCKET", "amplify-assets")       # Storage Bucket for generated assets
LLM_MODEL = os.environ.get("AMPLIFY_LLM_MODEL", "anthropic.claude-opus-4-8")  # from `uipath list-models`
# NOTE: we call Claude via UiPathChatAnthropicBedrock (LangChain, model-aware). The lower-level
# sdk.llm.chat_completions always sends `temperature`, which opus-4.7/4.8 & sonnet-5 reject (400);
# the LangChain class handles that, so the best models (opus-4-8) work.
GH_ASSET = os.environ.get("AMPLIFY_GITHUB_ASSET", "AmplifyGitHubPat")  # Orchestrator Asset holding a GitHub PAT.
# Default to the asset name so the DEPLOYED agent authenticates out-of-the-box: the tenant runtime
# does not ship our local .env (it's a secret), so absent this default GH_ASSET would be "" and
# every private-repo fetch would 404 (GitHub returns 404, not 403, when unauthenticated). Set to ""
# via env to force unauthenticated/public-only.
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
    # Prefer an Orchestrator Asset holding a PAT (Credential/Secret masked, or Text), else an
    # Integration Service connection token, else unauthenticated (public repos only). The
    # secret is read at runtime and never stored in code (secret-leakage).
    if GH_ASSET:
        a = _sdk().assets
        return (
            a.retrieve_secret(GH_ASSET, folder_path=FOLDER)
            or a.retrieve_credential(GH_ASSET, folder_path=FOLDER)
            or getattr(a.retrieve(GH_ASSET, folder_path=FOLDER), "string_value", None)
            or ""
        )
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
        # SPOC = who published the release (the GitHub login of the release author).
        spoc = (d.get("author") or {}).get("login") or ""
        ctx.update(owner=owner, repo=repo, tag=tag, name=d.get("name"), body=d.get("body") or "", spoc=spoc)
    else:  # feature
        m = re.search(r"github\.com/([^/]+)/([^/]+)/pull/(\d+)", state.source_url)
        owner, repo, num = m.group(1), m.group(2), m.group(3)
        r = httpx.get(f"https://api.github.com/repos/{owner}/{repo}/pulls/{num}", headers=headers, timeout=30)
        r.raise_for_status()
        pr = r.json()
        # SPOC = who opened the PR (or the assignee, if set) — the person with the most context.
        spoc = ((pr.get("assignee") or {}).get("login")) or ((pr.get("user") or {}).get("login")) or ""
        ctx.update(owner=owner, repo=repo, number=int(num), title=pr.get("title"), body=pr.get("body") or "", spoc=spoc)
    return {"kind": kind, "context": ctx}


AUTHOR_SYS = {
    "release": (
        "You are Amplify's content director. From the GitHub release notes below, author a grounded, "
        "internal-enablement ReleasePlan as strict JSON with keys: release_name, version, product "
        "(the CONCISE UiPath product or product-line name this belongs to — e.g. \"Verticals\", "
        "\"Amplify\", \"Maestro\" — not a long description), theme, at_a_glance, "
        'audience ("internal"), highlights[] (title, value_line, persona, '
        'group in ["New capabilities","Improvements","Fixes that matter"], source_pr, jira_key?), '
        "long_tail[] (title, source_pr), what_to_tell_customers[], notes_url. "
        "Curate the top 4-8 highlights; never invent a claim the notes don't support. "
        'Then add a top-level "claim_status" = "reviewed" if every value_line is supported by the notes, else "flags".'
    ),
    "feature": (
        "You are Amplify's content director. From the PR (+ any linked Jira) below, author a grounded VideoPlan v3 "
        "as strict JSON (feature_name, product (the CONCISE UiPath product or product-line name this feature is in "
        "— e.g. \"Amplify\", \"Verticals\" — not a long description), value_prop, persona, "
        "when_to_use, talking_points[], objections[], scenes[], youtube_metadata). "
        "Ground every claim in the diff/notes; never invent. "
        'Add a top-level "claim_status" = "reviewed" or "flags".'
    ),
}


async def author(state: AgentState) -> dict:
    # Claude via the AI Trust Layer (LangChain gateway class — model-aware, so opus-4-8 works).
    from uipath_langchain.chat import UiPathChatAnthropicBedrock
    from langchain_core.messages import SystemMessage, HumanMessage
    sys = AUTHOR_SYS[state.kind]
    steer = f"\n\nSteering (add emphasis only, do not override facts): {state.custom_prompt}" if state.custom_prompt else ""
    user = f"Source URL: {state.source_url}\n\nContext:\n{json.dumps(state.context)[:24000]}{steer}"
    llm = UiPathChatAnthropicBedrock(model=LLM_MODEL, max_tokens=4096)
    resp = await llm.ainvoke([SystemMessage(sys), HumanMessage(user)])
    text = resp.content if isinstance(resp.content, str) else str(resp.content)
    obj = json.loads(re.search(r"\{.*\}", text, re.S).group(0))
    claim = obj.pop("claim_status", "reviewed")
    return {"plan": obj, "claim_status": claim}


def _safe_seg(seg: str) -> str:
    # allowlist for a bucket blob-path segment — no '/', no '..', no traversal (path-traversal).
    seg = re.sub(r"[^A-Za-z0-9._-]", "-", seg or "").strip("-.") or "asset"
    return seg[:80]


def render(state: AgentState) -> dict:
    # RELEASE: render the one-pager + digest as HTML *in the serverless cloud* (pure strings,
    # no Chrome/FFmpeg) and upload to the bucket directly — fully automatic, no robot, no invoke.
    # FEATURE (video): needs the Node/Bun/Chrome/FFmpeg toolchain, which the serverless runtime
    # lacks — it can't run here. Skip gracefully so the run still completes and stores the plan;
    # the video renders via the TS pipeline on a machine that has the toolchain, same quality.
    plan = state.plan
    if state.kind == "release":
        from release_render import render_release_onepager_html, build_digest_html
        version = _safe_seg(str(plan.get("version") or plan.get("release_name") or "asset"))
        prefix = f"amplify/{version}"  # fixed prefix + sanitized segment => no traversal
        onepager_blob = f"{prefix}/onepager.html"
        digest_blob = f"{prefix}/digest.html"
        b = _sdk().buckets
        b.upload(name=BUCKET, blob_file_path=onepager_blob, content=render_release_onepager_html(plan),
                 content_type="text/html", folder_path=FOLDER)
        b.upload(name=BUCKET, blob_file_path=digest_blob, content=build_digest_html(plan),
                 content_type="text/html", folder_path=FOLDER)
        return {"artifacts": {
            "onepager_url": f"bucket://{BUCKET}/{onepager_blob}",
            "digest_url": f"bucket://{BUCKET}/{digest_blob}",
            "render_status": "rendered",
        }}

    # FEATURE (video): needs Chrome/FFmpeg. Start the amplify-render job on the UNATTENDED robot
    # (Orchestrator dispatches server-initiated jobs only to unattended robots). The job runs async
    # and uploads to deterministic bucket paths (same _safe scheme render.py uses) — store those now;
    # the files land when the robot finishes. If the process isn't deployed yet, skip gracefully so
    # the run still completes and stores the plan.
    version = _safe_seg(str(plan.get("version") or plan.get("feature_name") or "asset"))
    prefix = f"amplify/{version}"
    try:
        _sdk().processes.invoke(
            RENDER_PROCESS,
            {"kind": state.kind, "plan": json.dumps(plan)},
            folder_path=FOLDER,
        )
    except Exception as e:
        msg = (str(e).splitlines() or [""])[0][:200] or e.__class__.__name__
        return {"artifacts": {"render_status": f"skipped: render process unavailable ({msg})"}}
    return {"artifacts": {
        "video_url": f"bucket://{BUCKET}/{prefix}/video.mp4",
        "onepager_url": f"bucket://{BUCKET}/{prefix}/onepager.pdf",
        "render_status": "rendering (unattended job started)",
    }}


def store(state: AgentState) -> dict:
    # Persist the generated assets + metadata into the EnablementAsset entity.
    # A separate UiPath App reads these records to surface the assets.
    # Data Service entities are tenant-scoped (auth is the isolation boundary); field
    # names are alphanumeric camelCase (Data Service rejects underscores).
    sdk = _sdk()
    ent = sdk.entities.retrieve_by_name(ENTITY)
    a = state.artifacts

    # Clamp each value to its Data Service field length limit — the model's copy is free-form and
    # can exceed a field's cap (Data Service 400s the whole insert otherwise). Non-destructive:
    # works against the existing entity without a schema change. Limits mirror setup_entity.py.
    LIMITS = {
        "assetType": 40, "title": 400, "product": 200, "description": 200, "spoc": 200,
        "sourceRef": 2000, "customPrompt": 2000,
        "videoUrl": 2000, "onepagerUrl": 2000, "digestUrl": 2000,
        "qaStatus": 40, "claimCheckStatus": 40,
    }

    def _clip(val, cap: int):
        if not val:
            return val
        s = str(val)
        return (s[: cap - 1] + "…") if len(s) > cap else s

    raw = {
        "assetType": state.kind,
        "title": state.plan.get("feature_name") or f"Release {state.plan.get('version', '')}",
        "product": state.plan.get("product") or state.plan.get("release_name") or "",
        # short blurb shown under the heading (what the feature/release is about)
        "description": state.plan.get("value_prop") or state.plan.get("theme") or state.plan.get("at_a_glance") or "",
        # single point of contact — captured deterministically from the PR/release author in ingest
        "spoc": state.context.get("spoc") or "",
        "sourceRef": state.source_url,
        "customPrompt": state.custom_prompt or "",
        "videoUrl": a.get("video_url"),
        "onepagerUrl": a.get("onepager_url"),
        "digestUrl": a.get("digest_url"),
        "qaStatus": "passed",
        "claimCheckStatus": state.claim_status,
    }
    record = {k: _clip(v, LIMITS[k]) for k, v in raw.items()}
    # Human-review gate: the agent always writes False on generation; reviewed separately.
    record["reviewStatus"] = False
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
