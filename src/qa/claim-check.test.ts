import { test, expect } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildClaimRequest, parseClaimFindings, applyClaimGate } from "./claim-check";

test("buildClaimRequest pulls narration from footage vs normal scenes", () => {
  const req = buildClaimRequest(
    { commits: ["feat: x"], diff: "diff-body" },
    [ { id: "a", narration: "hello" }, { id: "demo", footage: { narration: "in action" } } ],
  );
  expect(req.commits).toEqual(["feat: x"]);
  expect(req.diff).toBe("diff-body");
  expect(req.scenes).toEqual([ { id: "a", narration: "hello" }, { id: "demo", narration: "in action" } ]);
});

test("parseClaimFindings: clean array, fenced, malformed-dropped, garbage→[]", () => {
  const clean = JSON.stringify([{ sceneId: "s2", claim: "cuts time 50%", severity: "high", reason: "no metric in diff" }]);
  expect(parseClaimFindings(clean)).toEqual([{ sceneId: "s2", claim: "cuts time 50%", severity: "high", reason: "no metric in diff" }]);
  const fenced = "Here you go:\n```json\n" + clean + "\n```\nthanks";
  expect(parseClaimFindings(fenced).length).toBe(1);
  const mixed = JSON.stringify([{ claim: "ok", severity: "weird" }, { reason: "no claim" }, { claim: "  " }]);
  const r = parseClaimFindings(mixed);
  expect(r.length).toBe(1);
  expect(r[0].severity).toBe("medium");
  expect(parseClaimFindings("not json at all")).toEqual([]);
  expect(parseClaimFindings("")).toEqual([]);
});

test("applyClaimGate writes the request; pending w/o claims.json, reviewed with it", () => {
  const dir = join(process.cwd(), "out/test-claim"); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const req = { commits: ["c"], diff: "d", scenes: [{ id: "a", narration: "n" }] };
  const pending = applyClaimGate(dir, req);
  expect(existsSync(join(dir, "claim-check-request.json"))).toBe(true);
  expect(pending.status).toBe("pending");
  expect(pending.findings).toEqual([]);
  writeFileSync(join(dir, "claims.json"), JSON.stringify([{ claim: "unsupported", severity: "high", reason: "r" }]));
  const reviewed = applyClaimGate(dir, req);
  expect(reviewed.status).toBe("reviewed");
  expect(reviewed.findings.length).toBe(1);
  rmSync(dir, { recursive: true, force: true });
});
