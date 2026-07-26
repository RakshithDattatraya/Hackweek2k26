# amplify-render — the render step (Orchestrator process)

The agent calls `sdk.processes.invoke("amplify-render", {"kind","plan","version"})`; this
turns a plan into artifacts, uploads them to the `amplify-assets` bucket, and returns
`bucket://` references the agent stores in the `EnablementAsset` entity.

**Why it's separate:** rendering needs a toolchain a stock UiPath robot lacks —
**Node/Bun + headless Chrome** (release one-pager/PDF) and **FFmpeg** (feature video).

## Set up the runner (a machine/robot with the toolchain)
1. Install: Node 22+, `bun`, Google Chrome (headless), FFmpeg.
2. Check out the Amplify TS repo on the runner; `bun install`. Set `REPO_DIR` to its path
   and `HYPERFRAMES_NODE_BIN="$(dirname "$(nvm which stable)")"`.
3. `uipath auth` on the runner (or use unattended client credentials); it uploads to the
   same tenant/`amplify-assets` bucket in the `Shared` folder.

## Run / publish
- Local run:  `python render.py input.json output.json`
  where `input.json` = `{"kind":"release","plan":"<ReleasePlan json string>"}`.
- Publish as an Orchestrator process named **amplify-render** (`uipath pack` / `uipath publish`,
  or wrap `render.py` in an RPA "Run Command"/coded step). The agent invokes it by that name.

## Security
- Blob paths are a fixed `amplify/<sanitized-version>/…` prefix — the version segment is
  allowlisted to `[A-Za-z0-9._-]` (no `/`, no `..`) so plan content can't cause path traversal.
- Returns `bucket://` references, never signed SAS URLs — no long-lived storage token leaves the runner.
- The runner's UiPath auth artifacts (`.uipath/`, `.env`) must stay out of git (already ignored).
