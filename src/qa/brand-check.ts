import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isCustomScene, type VideoPlanV3 } from "../content-director/plan-schema";
import type { BrandTokens } from "../brand/token-resolver";
import type { QAFinding } from "./lint";

function palette(): Set<string> {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "brand/uipath-tokens.json"), "utf8"));
  const hexes = new Set<string>();
  const walk = (o: any) => {
    if (typeof o === "string") { const m = o.match(/^#([0-9a-fA-F]{6})$/); if (m) hexes.add(("#" + m[1]).toLowerCase()); }
    else if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") Object.values(o).forEach(walk);
  };
  walk(raw.color);
  // common neutrals used by the builder chrome
  ["#ffffff", "#000000", "#1e2c35", "#33434d", "#93a0a8", "#c4ccd2", "#3f0e40", "#1164a3", "#1d1c1d", "#616061"].forEach((h) => hexes.add(h));
  return hexes;
}

export function brandCheck(plan: VideoPlanV3, _tokens: BrandTokens): QAFinding[] {
  const allowed = palette();
  const findings: QAFinding[] = [];
  for (const s of plan.scenes) {
    if (!isCustomScene(s)) continue;
    const text = `${s.html}\n${s.css ?? ""}`;
    const hexes = text.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    for (const h of hexes) {
      if (!allowed.has(h.toLowerCase())) {
        findings.push({ check: "brand-palette", sceneId: s.id, message: `off-palette color ${h} — use a --uip-* token var or a brand hex` });
      }
    }
  }
  return findings;
}
