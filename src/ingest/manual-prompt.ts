import { SourceContextSchema, type SourceContext } from "../types";

export function promptToSourceContext(prompt: string): SourceContext {
  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("Prompt is empty");
  const firstLine = trimmed.split("\n")[0].slice(0, 80);
  return SourceContextSchema.parse({
    kind: "prompt",
    title: firstLine,
    summary: firstLine,
    details: trimmed,
    evidence: [trimmed],
    links: [],
  });
}
