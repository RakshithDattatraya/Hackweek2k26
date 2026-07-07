import { z } from "zod";

export const SceneTypeSchema = z.enum(["hook", "capability", "demo", "positioning", "cta", "diagram"]);

export const AssetRequirementSchema = z.object({
  need: z.enum(["brand_intro", "diagram", "callout", "section_card", "brand_outro"]),
  spec: z.string(),
});

export const SceneSchema = z.object({
  id: z.string().min(1),
  type: SceneTypeSchema,
  duration: z.number().positive(),
  on_screen_text: z.string(),
  narration: z.string().min(1),
  footage_requirement: z.object({ steps: z.array(z.string()) }).optional(),
  asset_requirements: z.array(AssetRequirementSchema).default([]),
});

export const VideoPlanSchema = z.object({
  feature_name: z.string().min(1),
  value_prop: z.string(),
  persona: z.string(),
  when_to_use: z.string(),
  talking_points: z.array(z.string()).min(1),
  scenes: z.array(SceneSchema).min(1),
  youtube_metadata: z.object({
    title: z.string(),
    description: z.string(),
    tags: z.array(z.string()),
    chapters: z.array(z.object({ title: z.string(), start: z.number().nonnegative() })),
  }),
});

export type VideoPlan = z.infer<typeof VideoPlanSchema>;
export type Scene = z.infer<typeof SceneSchema>;

export function validatePlan(data: unknown): VideoPlan {
  return VideoPlanSchema.parse(data);
}
