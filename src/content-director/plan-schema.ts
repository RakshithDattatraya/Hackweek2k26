import { z } from "zod";

export const SceneTypeSchema = z.enum(["hook", "capability", "demo", "positioning", "cta", "diagram"]);

export const AssetRequirementSchema = z.object({
  need: z.string(),
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

export const SceneMotionSchema = z.object({
  pushScale: z.number().optional(),
  pushY: z.number().optional(),
  ease: z.string().optional(),
  autoZoom: z.boolean().optional(),
  stagger: z.number().optional(),
});

export const SceneV2Schema = z.object({
  id: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/, "id must be alphanumeric, underscore, or hyphen"),
  component: z.string().min(1),
  props: z.record(z.string(), z.unknown()).default({}),
  narration: z.string().min(1),
  duration: z.number().positive().optional(),
  motion: SceneMotionSchema.optional(),
  transitionOut: z.string().optional(),
  transitionOverlap: z.number().nonnegative().optional(),
});

export const VideoPlanV2Schema = z.object({
  feature_name: z.string().min(1),
  value_prop: z.string(),
  persona: z.string(),
  when_to_use: z.string(),
  talking_points: z.array(z.string()).min(1),
  scenes: z.array(SceneV2Schema).min(1),
  youtube_metadata: z.object({
    title: z.string(), description: z.string(),
    tags: z.array(z.string()), chapters: z.array(z.object({ title: z.string(), start: z.number().nonnegative() })),
  }),
});

export type SceneV2 = z.infer<typeof SceneV2Schema>;
export type VideoPlanV2 = z.infer<typeof VideoPlanV2Schema>;

export function validatePlanV2(data: unknown): VideoPlanV2 {
  return VideoPlanV2Schema.parse(data);
}

export const CustomSceneSchema = z.object({
  id: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/, "id must be alphanumeric, underscore, or hyphen"),
  html: z.string().min(1),
  css: z.string().optional(),
  motionScript: z.string().optional(),
  narration: z.string().min(1),
  duration: z.number().positive().optional(),
  transitionOut: z.string().optional(),
  transitionOverlap: z.number().nonnegative().optional(),
});

export const ZoomKeyframeSchema = z.object({
  at: z.number().nonnegative(),
  scale: z.number().min(1),
  x: z.number().min(0).max(1).optional(),
  y: z.number().min(0).max(1).optional(),
  ease: z.enum(["linear", "smooth"]).optional(),
});
export type ZoomKeyframe = z.infer<typeof ZoomKeyframeSchema>;

export const FootageSceneSchema = z.object({
  id: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/, "id must be alphanumeric, underscore, or hyphen"),
  footage: z.object({ narration: z.string().min(1), clipPath: z.string().optional(), zoom: z.array(ZoomKeyframeSchema).optional() }),
  duration: z.number().positive().optional(),
  transitionOut: z.string().optional(),
  transitionOverlap: z.number().nonnegative().optional(),
});
export type FootageScene = z.infer<typeof FootageSceneSchema>;

export function isFootageScene(s: unknown): s is FootageScene {
  return typeof s === "object" && s !== null && "footage" in s;
}

export const VideoPlanV3Schema = z.object({
  feature_name: z.string().min(1), value_prop: z.string(), persona: z.string(),
  when_to_use: z.string(), talking_points: z.array(z.string()).min(1),
  music_mood: z.string().optional(),
  scenes: z.array(z.union([FootageSceneSchema, CustomSceneSchema, SceneV2Schema])).min(1),
  youtube_metadata: z.object({ title: z.string(), description: z.string(),
    tags: z.array(z.string()), chapters: z.array(z.object({ title: z.string(), start: z.number().nonnegative() })) }),
});

export type CustomScene = z.infer<typeof CustomSceneSchema>;
export type VideoPlanV3 = z.infer<typeof VideoPlanV3Schema>;

export function isCustomScene(s: unknown): s is CustomScene {
  return typeof s === "object" && s !== null && "html" in s;
}

export function validatePlanV3(data: unknown): VideoPlanV3 {
  return VideoPlanV3Schema.parse(data);
}
