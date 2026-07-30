# Amplify — Feature → Enablement Pipeline

*Every ship, amplified to sales.*

**Category:** Business productivity (GTM / sales enablement) — with a strong P&E-productivity angle (shift-left enablement).

---

## Elevator pitch (≈290 words)

Engineering ships faster than sales can learn. Features land, and the field can't tell what shipped, what it's worth, or which customer it fits — so great work goes unsold and unseen. Enablement usually dies when someone tries to reconstruct that context weeks later, cold.

**Amplify closes the gap at the source.** The moment a feature is built — when its context is richest — Amplify reads the pull request *and* the linked Jira ticket, in a single step, and auto-drafts a premium, on-brand enablement video plus a matching one-pager. It runs as a new step in the delivery pipeline, right after deploy, so enablement becomes part of the definition of done alongside tests and docs — except this box fills itself.

The magic is **two directors**. A *content director* decides what the feature means and what sales needs to hear, grounded strictly in the PR and Jira — it never invents a claim the source doesn't support. A *camera director* reuses the engineer's existing demo recording and guides the viewer's eye with cinematic auto-zoom. Voice, music, sound design, captions, and UiPath brand styling are applied automatically.

**Trust is built in.** A claim-check gate flags any narration the code doesn't back up and routes it to a human. And a merge triggers *capture, not publish* — a person always approves before anything reaches a customer.

Amplify is built to run natively on **UiPath's agentic platform**: the content director as a coded agent, **Orchestrator** running the render, **Action Center** as the human approval gate, and **Integration Service** pulling PR and Jira context.

The result: engineers never become marketers — their features market themselves — and sales knows what shipped, where it fits, and how to sell it, on day one. From merged to market, automatically. *(This very demo was made by Amplify.)*

---

## Project details

**The problem.** Engineering velocity keeps rising; enablement can't keep up. "Shipped" isn't "sellable" — sales are baffled by the pace, can't articulate value, and can't tell which customer a feature fits. Enablement fails because the feature's context is reconstructed weeks later by someone who didn't build it.

**The insight.** The best person to pitch a feature is the one who just shipped it, and their context is richest — and most perishable — at that moment. So capture it at the source: enablement becomes a pipeline step (right after deploy) and a definition-of-done item, auto-generated.

**What it does.** On merge, Amplify reads the PR + linked Jira ticket in one step → drafts a structured VideoPlan → generates bespoke, on-brand scenes → reuses the engineer's demo recording with guided auto-zoom → layers expressive voiceover, ducked music, SFX, and captions → and emits **two artifacts from one plan**: a ~2-minute enablement video and a matching one-pager.

**Two directors (core IP).** *Content director* — the story + the sales layer, grounded in PR/Jira, never inventing a claim. *Camera director* — where the eye goes, auto-zoom on real footage, so screen capture guides instead of wanders.

**Trust model.** A claim-check gate compares every narration line to the source and flags unsupported claims for a human. A merge triggers **capture, not publish** — human approval before anything customer-facing ships.

**Demo (≤7 min).** The submitted demo video was generated end-to-end by Amplify itself — the script, design, voice, and the guided Public-Apps footage.

---

## UiPath technology used

Amplify is architected to run natively on the **UiPath Agentic Automation platform** — a coded agent (the brain) orchestrating a robot render step, with humans in the loop via Action Center. *(Designed and feasibility-validated against the UiPath coded-agents Python SDK; the generation pipeline itself is built and runs today.)*

- **Agents SDK — Coded Agents (Python).** The "brain" runs as a UiPath **coded agent**: it ingests the PR + Jira context, authors the structured VideoPlan, and runs the claim-check. Built on the SDK's agent + interrupt model, so human steps are first-class in the agent's control flow rather than bolted on.
- **Orchestrator.** The heavy render (headless-Chrome + FFmpeg) runs as an **unattended process/robot** the agent invokes (`sdk.processes.invoke`) — keeping the LLM brain and the compute cleanly separated. Orchestrator schedules, monitors, and logs each run; **Storage Buckets** pass the plan in and the video / one-pager / QA report out.
- **Action Center — the human-in-the-loop gate (core to the design).** A merge triggers *capture, **not** publish*. The generated draft — video, one-pager, and the QA + claim-check report — is raised as an **Action Center** task; the agent **interrupts** and waits. HITL touchpoints:
  1. **Approve / reject** the draft — nothing customer-facing ships without sign-off.
  2. **Adjudicate claim-check flags** — any narration the code/Jira doesn't support is surfaced for the reviewer to accept, edit, or reject *before* publish.
  3. **Send back for regeneration** with a note (e.g., "lead with the compliance angle"), which resumes the agent with new guidance.
  4. **Choose publish channels** (internal only, or add YouTube, etc.).
  On approval, the agent resumes and the publish step runs; otherwise it loops back — a true bounded, auditable human gate.
- **Integration Service.** Connectors do the plumbing, no custom glue: **GitHub** (merge/PR trigger + diff & commits), **Jira** (the linked ticket — customer ask + acceptance criteria), and outbound publish via **Slack** (sales-channel ping), **Confluence** (enablement hub), and **YouTube** (optional).
- **UiPath Apps.** The real feature shown in the demo — public / anonymous app access — i.e., the example Amplify turned into enablement.
- **UiPath brand system.** Design tokens (color, type, logo) applied to every generated scene, video, and one-pager, so output is on-brand by construction.

## Non-UiPath technology used
- **Claude (Anthropic)** — the LLM "brain": content director + claim-check, as an agent-native skill.
- **HyperFrames** (HeyGen, Apache-2.0) — HTML→MP4 rendering framework.
- **TypeScript**, **Bun** (runtime + test suite), **zod** (schema validation).
- **Headless Chrome** (deterministic frame capture), **GSAP** (animation), **FFmpeg** (encode, concat, audio mix, camera-zoom).
- **ElevenLabs** (expressive voiceover) with a macOS neural-voice fallback; **Whisper** (caption transcription).
- **Git / GitHub** (PR + diff ingest); **Pixabay** CC0 music (mood-matched beds).
