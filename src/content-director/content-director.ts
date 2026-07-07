import type { SourceContext } from "../types";
import { validatePlan, type VideoPlan } from "./plan-schema";

/**
 * Deterministic baseline content director.
 * LLM UPGRADE SEAM: replace the body of this function with a call to the
 * content-director Claude skill (see SKILL.md). Contract is unchanged:
 * SourceContext in, schema-valid VideoPlan out, no claims beyond ctx.evidence.
 */
export function generatePlan(ctx: SourceContext): VideoPlan {
  const name = ctx.title.replace(/\.$/, "");
  const plan: VideoPlan = {
    feature_name: name,
    value_prop: ctx.summary,
    persona: "Account Executive",
    when_to_use: `When a customer's problem maps to: ${ctx.summary}`,
    talking_points: [ctx.summary, `Ask discovery questions about ${name}.`],
    scenes: [
      { id: "s1", type: "hook", duration: 4, on_screen_text: "Here's the problem customers keep hitting.", narration: `Customers kept running into the problem that ${name} solves.`, asset_requirements: [] },
      { id: "s2", type: "capability", duration: 4, on_screen_text: name, narration: `Meet ${name}. ${ctx.summary}`, asset_requirements: [] },
      { id: "s3", type: "demo", duration: 4, on_screen_text: "See it in action", narration: `Here is ${name} working on a real example.`, footage_requirement: { steps: [] }, asset_requirements: [] },
      { id: "s4", type: "positioning", duration: 4, on_screen_text: "When to bring this up", narration: `Bring up ${name} when a customer describes this pain: ${ctx.summary}`, asset_requirements: [] },
      { id: "s5", type: "cta", duration: 3, on_screen_text: "Learn more", narration: `Find the full enablement kit for ${name} on the internal docs hub.`, asset_requirements: [] },
    ],
    youtube_metadata: {
      title: `${name} — Enablement`,
      description: ctx.summary,
      tags: ["uipath", "enablement"],
      chapters: [{ title: "Hook", start: 0 }],
    },
  };
  return validatePlan(plan);
}
