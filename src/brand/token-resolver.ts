import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface BrandTokens {
  orange: string;
  teal: string;
  deepBlue: string;
  white: string;
  fontHeadline: string;
  fontBody: string;
  logoOrange: string;
}

export function loadBrandTokens(root: string = process.cwd()): BrandTokens {
  const raw = JSON.parse(readFileSync(join(root, "brand/uipath-tokens.json"), "utf8"));
  const p = raw.color.primary;
  return {
    orange: p.roboticOrange.hex,
    teal: p.agenticTeal.hex,
    deepBlue: p.deepBlue.hex,
    white: p.brightWhite.hex,
    fontHeadline: raw.typography.headline.family,
    fontBody: raw.typography.body.family,
    logoOrange: raw.logo.assets.orange.file,
  };
}
