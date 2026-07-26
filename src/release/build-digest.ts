import type { ReleasePlan } from "../content-director/release-plan-schema";
import { escapeHtml } from "../compose/scene-card";

export function buildDigest(plan: ReleasePlan, opts: { onepagerUrl?: string } = {}): { slackMarkdown: string; confluenceHtml: string } {
  const top = plan.highlights.slice(0, 5);
  const slackMarkdown = [
    `*${plan.release_name} ${plan.version} is out* — ${plan.theme}`,
    ...top.map((h) => `• *${h.title}* — ${h.value_line} _(for ${h.persona})_`),
    plan.what_to_tell_customers.length ? `\n*What to tell customers:* ${plan.what_to_tell_customers.join(" ")}` : "",
    opts.onepagerUrl ? `\n📄 One-pager: ${opts.onepagerUrl}` : "",
    `🔗 Full notes: ${plan.notes_url}`,
  ].filter(Boolean).join("\n");

  const li = (s: string) => `<li>${escapeHtml(s)}</li>`;
  const confluenceHtml = [
    `<h1>${escapeHtml(plan.release_name)} ${escapeHtml(plan.version)}</h1>`,
    `<p><em>${escapeHtml(plan.theme)}</em></p>`,
    `<h2>Highlights</h2><ul>`,
    ...top.map((h) => li(`${h.title} — ${h.value_line} (for ${h.persona})`)),
    `</ul>`,
    plan.what_to_tell_customers.length ? `<h2>What to tell customers</h2><ul>${plan.what_to_tell_customers.map(li).join("")}</ul>` : "",
    `<p><a href="${escapeHtml(plan.notes_url)}">Full release notes</a></p>`,
  ].join("");
  return { slackMarkdown, confluenceHtml };
}
