import { z } from "zod";

export const ReleaseHighlightSchema = z.object({
  title: z.string().min(1),
  value_line: z.string().min(1),
  persona: z.string().min(1),
  group: z.enum(["New capabilities", "Improvements", "Fixes that matter"]),
  source_pr: z.string().url(),
  jira_key: z.string().optional(),
});

export const ReleasePlanSchema = z.object({
  release_name: z.string().min(1),
  version: z.string().min(1),
  theme: z.string().min(1),
  at_a_glance: z.string().optional(),
  audience: z.literal("internal"),
  highlights: z.array(ReleaseHighlightSchema).min(1).max(8),
  long_tail: z.array(z.object({ title: z.string().min(1), source_pr: z.string().url() })).default([]),
  what_to_tell_customers: z.array(z.string()).default([]),
  notes_url: z.string().url(),
});

export type ReleasePlan = z.infer<typeof ReleasePlanSchema>;
export function validateReleasePlan(data: unknown): ReleasePlan { return ReleasePlanSchema.parse(data); }
