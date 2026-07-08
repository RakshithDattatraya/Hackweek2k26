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
    const scripts: [string, string | undefined][] = [
      ["motionScript", (s as any).motionScript],
      ["transitionOut", (s as any).transitionOut],
    ];
    for (const [field, script] of scripts) {
      if (!script) continue;
      for (const f of FORBIDDEN) {
        if (f.re.test(script)) {
          findings.push({ check: "determinism-lint", sceneId: s.id, message: `${field} uses forbidden non-deterministic call: ${f.name}` });
        }
      }
    }
  }
  return findings;
}
