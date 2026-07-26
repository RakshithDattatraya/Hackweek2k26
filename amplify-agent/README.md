# Amplify — UiPath coded agent

On a merge/release, this agent **generates the enablement assets and stores them in a
Data Service entity** (`EnablementAsset`). A separate UiPath App reads the entity and
surfaces the assets. No approval/publish step lives here.

**Flow:** `ingest → author (Claude via AI Trust Layer) → render (TS pipeline as a process) → store (entity)`

- Input: `{ source_url, custom_prompt? }`. The router auto-detects **feature** (PR URL) vs
  **release** (release URL) and emits only that path's artifacts.
- Output: `{ kind, entity_id, claim_status, artifacts }`.
- The tested reference logic lives in `../agent/` (Platform port, orchestrator, router — unit-tested);
  this project is the deployable LangGraph agent. All Orchestrator/Data-Service calls are scoped to
  `AMPLIFY_FOLDER_PATH` from the agent's own config — never from the trigger input (tenant/customer isolation).

## Deploy runbook

Prereqs: `uv` (or pip), and the UiPath org you created.

1. **Install:** `uv sync` (or `pip install -e .`) in this folder.
2. **Auth (opens a browser):** `uipath auth` → sign in to your org/tenant.
   - Environment: the auth domain is `UIPATH_URL` (if set), else the flag `--cloud` (default)
     / `--staging` / `--alpha`. For a **staging** org: `uipath auth --staging` (or `--alpha`).
     Foolproof: `UIPATH_URL="https://staging.uipath.com/<org>/<tenant>" uipath auth`.
     No code change needed — the SDK follows the env you authed into.
3. **Pick the LLM:** `uipath list-models` → choose a Claude id (e.g. `anthropic.claude-sonnet-4-5`)
   → set `AMPLIFY_LLM_MODEL` in `.env`.
4. **Create the entity** in Data Service — name it `EnablementAsset` with text fields:
   `type, title, source_ref, custom_prompt, video_url, onepager_url, digest_url, qa_status, claim_check_status`.
5. **Publish the renderer** as an Orchestrator process named `amplify-render` (set `AMPLIFY_RENDER_PROCESS`).
   It's a thin wrapper that runs the existing CLIs and returns artifact URLs:
   - release: `bun run src/pipeline/build-release.ts <plan.json>` → upload `out/release/*` to a Storage
     Bucket → return `onepager_url`, `digest_url`.
   - feature: `bun run src/pipeline/build-plan.ts <plan.json>` (or `build-from-branch`) → upload the mp4 +
     one-pager → return `video_url`, `onepager_url`.
   - The robot machine needs **Node/Bun + headless Chrome + FFmpeg**.
6. **Connections:** create Integration Service connections for **GitHub** (and **Jira** if you want
   ticket enrichment); put their keys in `AMPLIFY_GITHUB_CONNECTION` / `AMPLIFY_JIRA_CONNECTION`.
7. **Config:** `cp .env.example .env` and fill in the values (folder, entity, process, model, connections).
8. **Schema:** `uipath init` → derives `uipath.json` (agent I/O) from the graph.
9. **Local test:** `uipath run amplify '{"source_url": "https://github.com/UiPath/fins-vertical-solution/releases/tag/v2604.195.0"}'`
   → check a row lands in `EnablementAsset`.
10. **Publish:** `uipath deploy` (pack + publish). Then trigger it from the merge/release event
    (GitHub connection trigger) or on a schedule.

## Notes / to confirm on the tenant
Three call shapes depend on your tenant and are marked in `main.py` — confirm at step 9:
- the connection token field (`retrieve_token(...)` → `.access_token` vs `.value`);
- the `processes.invoke(...)` return shape (where the artifact URLs come back);
- the `insert_record(...)` record-id field.

Everything else uses verified `uipath` 2.13.16 signatures. Never commit `.env`.
