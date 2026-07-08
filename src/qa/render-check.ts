import { execFileSync } from "node:child_process";
import type { QAFinding } from "./lint";

export function parseHyperframesIssues(stdout: string): QAFinding[] {
  const findings: QAFinding[] = [];
  for (const line of stdout.split("\n")) {
    const l = line.trim();
    if (!l) continue;
    // Skip lines that start with ✓ (clean)
    if (l.startsWith("✓")) continue;
    // Skip summary tallies like "0 error(s), 6 warning(s)" — these are not
    // findings themselves; only flag them when the tallied count is nonzero.
    const tally = l.match(/(\d+)\s+error\(s\)/i);
    if (tally && Number(tally[1]) === 0) continue;
    // Match error indicators
    if (/(^✗|\berror\b|\bmissing\b|\boverflow\b|\bfailed\b)/i.test(l)) {
      findings.push({ check: "render-check", message: l });
    }
  }
  return findings;
}

export function renderCheck(outDir: string): QAFinding[] {
  const nodeBin = process.env.HYPERFRAMES_NODE_BIN;
  const env = nodeBin ? { ...process.env, PATH: `${nodeBin}:${process.env.PATH}` } : process.env;
  let out = "";
  for (const cmd of [["lint"], ["validate"]]) {
    try { out += execFileSync("npx", ["-y", "hyperframes@latest", ...cmd], { cwd: outDir, env }).toString() + "\n"; }
    catch (e: any) { out += (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "") + "\n"; }
  }
  return parseHyperframesIssues(out);
}
