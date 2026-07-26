# Deploying Amplify on UiPath (staging)

Everything except this deployment is validated live: auth, ingest (private repo), author
(Claude opus-4-8 via AI Trust Layer), render (`render.py` build+upload), store (entity), and the
`amplify-assets` bucket + `EnablementAsset` entity already exist. This is the last mile.

> **Tokens expire ~1h.** Re-run `../.agentvenv/bin/uipath auth --staging` before any local step
> if you see "Access token is expired". In production the runtime injects fresh tokens.

## 1. Register the render runner (attended robot)
`render.py` needs **Node 22+ / bun / headless Chrome / FFmpeg** — a stock robot lacks these, so
use a machine that has them. Your dev machine already ran it successfully.

1. Install **UiPath Assistant / Robot** on the runner and sign in to your **staging** org →
   it registers under Orchestrator → Tenant → **Machines**.
   - ⚠️ Classic attended robots run on **Windows** (+ the Assistant); macOS attended-robot support
     is limited. If this Mac can't register, use a Windows box, or a **Linux unattended VM**, with the
     toolchain — the same `render.py` runs on any of them.
2. Orchestrator → **Shared** folder → assign the machine + a robot to the folder.
3. On the runner: install the toolchain, `git clone` this repo, `bun install`, and set
   `REPO_DIR=<repo path>` and `HYPERFRAMES_NODE_BIN="$(dirname "$(nvm which stable)")"`.

## 2. Publish `render.py` as the `amplify-render` process
From `amplify-render/` on the runner:
1. `uipath auth --staging`
2. `uipath init` (derives the I/O schema from `render()`), then `uipath pack` && `uipath publish`.
   - Alternatively wrap it in an RPA process — a **Run Command**: `python render.py input.json output.json`.
3. Orchestrator → **Shared** → ensure a **process named `amplify-render`** exists, bound to the runner.
   The agent invokes it by that exact name.

## 3. Deploy the agent
From `amplify-agent/`:
1. `.env` (already set locally): `AMPLIFY_FOLDER_PATH=Shared`, `AMPLIFY_ENTITY=EnablementAsset`,
   `AMPLIFY_RENDER_PROCESS=amplify-render`, `AMPLIFY_LLM_MODEL=anthropic.claude-opus-4-8`,
   `AMPLIFY_GITHUB_ASSET=AmplifyGitHubPat`.
2. `uipath auth --staging` → `uipath init` → `uipath deploy` (pack + publish the coded agent).

## 4. Trigger it
- **Test:** `uipath invoke amplify '{"source_url":"https://github.com/UiPath/fins-vertical-solution/releases/tag/v2604.195.0"}'`
- **Production:** a GitHub connection **trigger** (merge/release event) → invoke the agent; or a schedule;
  or a button in your App.

## 5. The App (reads the entity)
Build a UiPath App over `EnablementAsset`. For each row, download the asset from the bucket:
`bucket://amplify-assets/<path>` → `sdk.buckets.download(name="amplify-assets", blob_file_path="<path>", ...)`,
then show the **video** (feature) or **one-pager/digest** (release).

## Security recap
- GitHub PAT lives in the `AmplifyGitHubPat` Orchestrator asset, read at runtime (never in code).
  *Recommendation:* make it a **Credential** asset (masked) rather than Text.
- Bucket blob paths are a fixed `amplify/<sanitized-version>/…` prefix (no traversal); the entity
  stores `bucket://` references, not signed SAS URLs.
- `.uipath/` and `.env` are gitignored; no credential file was ever committed.
