import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateReleasePlan, type ReleasePlan } from "../content-director/release-plan-schema";
import { renderReleaseOnePagerHtml } from "../onepager/render-release-html";
import { buildDigest } from "../release/build-digest";
import { loadBrandTokens } from "../brand/token-resolver";
import { htmlToPdf } from "../onepager/to-pdf";

export function buildRelease(planInput: ReleasePlan, outDir: string) {
  const plan = validateReleasePlan(planInput);
  outDir = resolve(outDir);
  mkdirSync(outDir, { recursive: true });
  const t = loadBrandTokens();
  const onepagerHtml = join(outDir, "onepager.html");
  writeFileSync(onepagerHtml, renderReleaseOnePagerHtml(plan, t, { notesUrl: plan.notes_url }));
  const pdfCand = join(outDir, "onepager.pdf");
  const onepagerPdf = htmlToPdf(onepagerHtml, pdfCand) ? pdfCand : null;
  const digest = buildDigest(plan);
  const slackPath = join(outDir, "digest.slack.md");
  const confluencePath = join(outDir, "digest.confluence.html");
  writeFileSync(slackPath, digest.slackMarkdown);
  writeFileSync(confluencePath, digest.confluenceHtml);
  return { onepagerHtml, onepagerPdf, slackPath, confluencePath };
}

if (import.meta.main) {
  const planPath = process.argv[2];
  const plan = validateReleasePlan(JSON.parse(readFileSync(planPath, "utf8")));
  const r = buildRelease(plan, join(process.cwd(), "out/release"));
  console.log("Release one-pager:", r.onepagerHtml, "| digest:", r.slackPath);
}
