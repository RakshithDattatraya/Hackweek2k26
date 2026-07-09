import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type ClaimFinding = { sceneId?: string; claim: string; severity: "high" | "medium"; reason: string };
export type ClaimCheckRequest = { commits: string[]; diff: string; scenes: { id: string; narration: string }[] };

/** Package the PR context + per-scene narration for the claim-check skill (footage scenes use footage.narration). */
export function buildClaimRequest(prContext: { commits: string[]; diff: string }, scenes: any[]): ClaimCheckRequest {
  const s = scenes.map((sc) => ({
    id: String(sc?.id ?? ""),
    narration: String(sc?.footage?.narration ?? sc?.narration ?? ""),
  }));
  return { commits: prContext.commits ?? [], diff: prContext.diff ?? "", scenes: s };
}

/** Tolerant parse of the skill's JSON output into ClaimFindings (strips fences/prose, drops malformed). */
export function parseClaimFindings(text: string): ClaimFinding[] {
  if (!text) return [];
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  else { const arr = t.match(/\[[\s\S]*\]/); if (arr) t = arr[0]; }
  let parsed: unknown;
  try { parsed = JSON.parse(t); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const out: ClaimFinding[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const claim = (item as any).claim;
    if (typeof claim !== "string" || !claim.trim()) continue;
    out.push({
      sceneId: typeof (item as any).sceneId === "string" ? (item as any).sceneId : undefined,
      claim: claim.trim(),
      severity: (item as any).severity === "high" ? "high" : "medium",
      reason: typeof (item as any).reason === "string" ? (item as any).reason : "",
    });
  }
  return out;
}

/** Write the claim-check request; fold in claims.json if the skill produced it, else mark pending. */
export function applyClaimGate(outDir: string, request: ClaimCheckRequest): { status: "pending" | "reviewed"; findings: ClaimFinding[] } {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "claim-check-request.json"), JSON.stringify(request, null, 2));
  const claimsPath = join(outDir, "claims.json");
  if (existsSync(claimsPath)) {
    return { status: "reviewed", findings: parseClaimFindings(readFileSync(claimsPath, "utf8")) };
  }
  return { status: "pending", findings: [] };
}
