"""amplify-render — the render step the coded agent invokes as an Orchestrator process.

The agent calls `sdk.processes.invoke("amplify-render", {"kind": ..., "plan": <json>})`.
This wrapper turns a plan into artifacts and uploads them to the `amplify-assets` bucket,
returning bucket references the agent stores in the EnablementAsset entity.

RUNS ON A RUNNER WITH THE TOOLCHAIN — Node/Bun + headless Chrome (+ FFmpeg for video):
  - release: `bun run src/pipeline/build-release.ts <plan.json>` -> out/release/{onepager.html,onepager.pdf,digest.confluence.html}
  - feature: `bun run src/pipeline/build-plan.ts   <plan.json>` -> out/latest-v2/{renders/video.mp4,onepager/onepager.pdf}

I/O contract (matches the agent's `render` node):
  input : {"kind": "feature"|"release", "plan": "<plan json string>", "version"?: str}
  output: {"onepager_url"?: str, "digest_url"?: str, "video_url"?: str}   # bucket:// refs

Usage (also how a UiPath coded/RPA process wraps it):
  python render.py <input.json> <output.json>

Config via env: AMPLIFY_BUCKET (default amplify-assets), AMPLIFY_FOLDER_PATH (default Shared),
REPO_DIR (path to the checked-out Amplify TS repo), HYPERFRAMES_NODE_BIN.
"""
from __future__ import annotations
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

BUCKET = os.environ.get("AMPLIFY_BUCKET", "amplify-assets")
FOLDER = os.environ.get("AMPLIFY_FOLDER_PATH", "Shared")
REPO_DIR = os.environ.get("REPO_DIR", os.getcwd())


def _safe(seg: str) -> str:
    # allowlist for a bucket blob-path segment — no '/', no '..', no traversal (path-traversal).
    seg = re.sub(r"[^A-Za-z0-9._-]", "-", seg or "").strip("-.") or "asset"
    return seg[:80]


def _bun(cli: str, plan_path: str) -> None:
    env = dict(os.environ)
    subprocess.run(["bun", "run", cli, plan_path], cwd=REPO_DIR, env=env, check=True)


def _upload(sdk, local: Path, blob: str) -> str:
    sdk.buckets.upload(name=BUCKET, blob_file_path=blob, source_path=str(local), folder_path=FOLDER)
    return f"bucket://{BUCKET}/{blob}"


def render(inp: dict) -> dict:
    from uipath.platform import UiPath
    sdk = UiPath()
    kind = inp["kind"]
    plan = inp["plan"] if isinstance(inp["plan"], str) else json.dumps(inp["plan"])
    plan_obj = json.loads(plan)
    version = _safe(inp.get("version") or plan_obj.get("version") or plan_obj.get("feature_name") or "asset")
    prefix = f"amplify/{version}"  # fixed prefix + sanitized segment => no traversal

    with tempfile.TemporaryDirectory() as tmp:
        plan_path = os.path.join(tmp, "plan.json")
        Path(plan_path).write_text(plan)
        out: dict[str, str] = {}
        if kind == "release":
            _bun("src/pipeline/build-release.ts", plan_path)
            base = Path(REPO_DIR, "out/release")
            if (base / "onepager.html").exists():
                out["onepager_url"] = _upload(sdk, base / "onepager.html", f"{prefix}/onepager.html")
            if (base / "digest.confluence.html").exists():
                out["digest_url"] = _upload(sdk, base / "digest.confluence.html", f"{prefix}/digest.html")
        else:  # feature
            _bun("src/pipeline/build-plan.ts", plan_path)
            base = Path(REPO_DIR, "out/latest-v2")
            vid = base / "renders" / "video.mp4"
            op = base / "onepager" / "onepager.pdf"
            if vid.exists():
                out["video_url"] = _upload(sdk, vid, f"{prefix}/video.mp4")
            if op.exists():
                out["onepager_url"] = _upload(sdk, op, f"{prefix}/onepager.pdf")
        return out


if __name__ == "__main__":
    inp = json.loads(Path(sys.argv[1]).read_text()) if len(sys.argv) > 1 else json.load(sys.stdin)
    result = render(inp)
    if len(sys.argv) > 2:
        Path(sys.argv[2]).write_text(json.dumps(result))
    print(json.dumps(result))
