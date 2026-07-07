import { z } from "zod";

export const SourceContextSchema = z.object({
  kind: z.enum(["prompt", "pr", "jira"]),
  title: z.string().min(1),
  summary: z.string(),
  details: z.string().min(1),
  evidence: z.array(z.string()).default([]),
  links: z.array(z.string()).default([]),
});

export type SourceContext = z.infer<typeof SourceContextSchema>;
