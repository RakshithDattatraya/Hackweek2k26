# Deploying Amplify on UiPath (staging)

Everything except this deployment is validated live: auth, ingest (private repo), author
(Claude opus-4-8 via AI Trust Layer), render (`render.py` build+upload), store (entity), and the
`amplify-assets` bucket + `EnablementAsset` entity already exist. This is the last mile.

> **Tokens expire ~1h.** Re-run `../.agentvenv/bin/uipath auth --staging` before any local step
> if you see "Access token is expired". In production the runtime injects fresh tokens.

## 0. Release vs video — where each renders
- **Release** (one-pager + digest, HTML) renders **in the agent, in the serverless cloud**
  (`release_render.py`) and uploads to the bucket directly. **No robot needed** — fully automatic.
- **Video** (feature path) needs **Node 22+ / bun / headless Chrome / FFmpeg**, which the serverless
  runtime lacks. So the agent starts the `amplify-render` job on a robot (steps 1–2). For the agent
  to trigger it automatically, that robot must be **UNATTENDED** (Orchestrator dispatches
  server-initiated jobs only to unattended robots). Attended is human-triggered — see §1b.

## 1. Register the render runner — UNATTENDED (automatic video)
`render.py` needs **Node 22+ / bun / headless Chrome / FFmpeg**. Cross-platform **unattended** is
reliable on **Linux/Windows**; macOS is best for *attended* only, so for automatic video use a
small **Linux VM** (or Windows box) with the toolchain.

1. **Prep the machine:** install the toolchain, `git clone` this repo, `bun install`, set
   `REPO_DIR=<repo path>` and `HYPERFRAMES_NODE_BIN="$(dirname "$(nvm which stable)")"`.
2. **Machine template:** Orchestrator → Tenant → **Machines** → *Add machine template* → copy its **machine key**.
3. **Unattended robot identity:** Tenant → **Manage Access** → create/assign a **robot account** (service
   account) with an **Unattended** robot, or a user with Unattended robot + this machine template.
   Requires an **Unattended runtime license** on the tenant.
4. **Install the cross-platform Robot** on the machine and connect it to Orchestrator with the
   **machine key** + Orchestrator URL (service/unattended mode, headless — not the Assistant).
5. **Assign to the folder:** Orchestrator → **Shared** → assign the machine + unattended robot.

### 1b. (Alternative) Register as ATTENDED — semi-automatic on your Mac
Attended can render video too, but **you** launch it (the agent can't auto-trigger it):
1. Install the **UiPath Assistant** on the Mac, sign in to the **staging** org → registers the
   machine + an attended robot for **your user** (Tenant → Machines).
2. Tenant → **Manage Access** → your user → **Robot setup → Attended**, assign a machine template.
3. Publish `amplify-render` (step 2) into a **folder your user is a member of** → it appears in the
   **Assistant** → click **Run** when a feature ships. (This is the manual path; not the agent's auto-invoke.)

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
