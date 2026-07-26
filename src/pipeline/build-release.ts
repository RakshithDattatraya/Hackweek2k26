import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { validateReleasePlan, type ReleasePlan } from "../content-director/release-plan-schema";
import { renderReleaseOnePagerHtml } from "../onepager/render-release-html";
import { buildDigest } from "../release/build-digest";
import { loadBrandTokens } from "../brand/token-resolver";
import { htmlToPdf } from "../onepager/to-pdf";

export function buildRelease(planInput: ReleasePlan, outDir: string) {
  const plan = validateReleasePlan(planInput);
  outDir = resolve(outDir);
  mkdirSync(outDir, { recursive: true });
  // Embed the brand logo inline as a data-URI so the page is fully self-contained
  // (the logo can't break when the HTML is moved or opened without an assets folder).
  // Also copy the file into assets/ as a convenience for anyone editing the HTML.
  mkdirSync(join(outDir, "assets"), { recursive: true });
  const logoSrc = join(process.cwd(), "brand/logos/uipath-logo-orange.png");
  let logoDataUri: string | undefined;
  if (existsSync(logoSrc)) {
    execFileSync("cp", [logoSrc, join(outDir, "assets/uipath-logo-orange.png")]);
    logoDataUri = `data:image/png;base64,${readFileSync(logoSrc).toString("base64")}`;
  }
  const t = loadBrandTokens();
  const onepagerHtml = join(outDir, "onepager.html");
  writeFileSync(onepagerHtml, renderReleaseOnePagerHtml(plan, t, { logoDataUri, notesUrl: plan.notes_url }));
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
