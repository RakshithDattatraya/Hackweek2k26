import type { CustomScene } from "../content-director/plan-schema";

// Prefix each style rule's selector list with `scope`. @keyframes/@media pass through unscoped.
export function scopeCss(css: string, scope: string): string {
  if (!css) return "";
  const out: string[] = [];
  let i = 0;

  while (i < css.length) {
    // Skip whitespace
    while (i < css.length && /\s/.test(css[i])) i++;
    if (i >= css.length) break;

    // Check for at-rule (@keyframes, @media, etc.)
    if (css[i] === "@") {
      const ruleStart = i;
      const atRuleMatch = css.slice(i).match(/^@[^{]+\{/);
      if (atRuleMatch) {
        i += atRuleMatch[0].length;
        // Find matching closing brace, handling nesting
        let braceCount = 1;
        while (i < css.length && braceCount > 0) {
          if (css[i] === "{") braceCount++;
          else if (css[i] === "}") braceCount--;
          i++;
        }
        // Keep at-rule as-is (unscoped)
        out.push(css.slice(ruleStart, i));
      } else {
        i++;
      }
    } else {
      // Regular selector rule
      const ruleStart = i;
      let braceCount = 0;
      let foundBrace = false;

      // Find opening brace
      while (i < css.length && css[i] !== "{") i++;
      if (i >= css.length) break;

      const selectorRaw = css.slice(ruleStart, i).trim();
      foundBrace = true;
      i++; // skip opening brace

      // Find matching closing brace
      braceCount = 1;
      const bodyStart = i;
      while (i < css.length && braceCount > 0) {
        if (css[i] === "{") braceCount++;
        else if (css[i] === "}") braceCount--;
        i++;
      }

      const body = css.slice(bodyStart, i - 1).trim();
      const scoped = selectorRaw.split(",").map((s) => `${scope} ${s.trim()}`).join(", ");
      out.push(`${scoped} { ${body} }`);
    }
  }

  return out.join("\n");
}

export function renderCustomInner(scene: CustomScene, scope: string): { html: string; css: string } {
  return { html: scene.html, css: scene.css ? scopeCss(scene.css, scope) : "" };
}
