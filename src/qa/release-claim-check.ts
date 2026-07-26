import type { ReleaseContext } from "../ingest/release-context";
import type { ReleasePlan } from "../content-director/release-plan-schema";

export function buildReleaseClaimRequest(ctx: ReleaseContext, plan: ReleasePlan) {
  const claims: { id: string; text: string }[] = [];
  plan.highlights.forEach((h, i) => claims.push({ id: `h${i}`, text: h.value_line }));
  plan.what_to_tell_customers.forEach((t, i) => claims.push({ id: `c${i}`, text: t }));
  return { notes: ctx.body, prs: ctx.prs, claims };
}
