import { isCustomScene, type VideoPlanV3 } from "../content-director/plan-schema";

export type QAFinding = { check: string; sceneId?: string; message: string };

const FORBIDDEN: { re: RegExp; name: string }[] = [
  { re: /\bDate\.now\b/, name: "Date.now" },
  { re: /\bMath\.random\b/, name: "Math.random" },
  { re: /\bnew\s+Date\s*\(/, name: "new Date(" },
  { re: /\bfetch\s*\(/, name: "fetch(" },
  { re: /\bXMLHttpRequest\b/, name: "XMLHttpRequest" },
  { re: /\bimport\s*\(/, name: "import(" },
];

export function lintPlan(plan: VideoPlanV3): QAFinding[] {
  const findings: QAFinding[] = [];
  for (const s of plan.scenes) {
    if (!isCustomScene(s) || !s.motionScript) continue;
    for (const f of FORBIDDEN) {
      if (f.re.test(s.motionScript)) {
        findings.push({ check: "determinism-lint", sceneId: s.id, message: `motionScript uses forbidden non-deterministic call: ${f.name}` });
      }
    }
  }
  return findings;
}
