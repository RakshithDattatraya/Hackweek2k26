import { lintPlan, type QAFinding } from "./lint";
import { brandCheck } from "./brand-check";
import { renderCheck } from "./render-check";
import type { VideoPlanV3 } from "../content-director/plan-schema";
import type { BrandTokens } from "../brand/token-resolver";

export type QAReport = { ok: boolean; findings: QAFinding[] };

export function runGate(plan: VideoPlanV3, tokens: BrandTokens, outDir: string, opts: { skipRenderCheck?: boolean } = {}): QAReport {
  const findings: QAFinding[] = [
    ...lintPlan(plan),
    ...brandCheck(plan, tokens),
    ...(opts.skipRenderCheck ? [] : renderCheck(outDir)),
  ];
  return { ok: findings.length === 0, findings };
}
