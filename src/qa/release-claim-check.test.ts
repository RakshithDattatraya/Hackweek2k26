import { test, expect } from "bun:test";
import { buildReleaseClaimRequest } from "./release-claim-check";

test("turns highlights + customer lines into claims to review", () => {
  const ctx: any = { body: "notes", prs: [{ number: 1, title: "t", url: "u" }] };
  const plan: any = { highlights: [{ title: "X", value_line: "Cuts onboarding 40%", source_pr: "u" }], what_to_tell_customers: ["Now SOC2 compliant"] };
  const req = buildReleaseClaimRequest(ctx, plan);
  expect(req.claims.map((c) => c.text)).toContain("Cuts onboarding 40%");
  expect(req.claims.map((c) => c.text)).toContain("Now SOC2 compliant");
  expect(req.notes).toBe("notes");
});
