import { z } from "zod";
import type { SceneComponent } from "./types";
import { esc } from "./types";

export const flow: SceneComponent = {
  propsSchema: z.object({
    eyebrow: z.string(),
    nodes: z.array(z.object({ icon: z.string(), label: z.string() })).min(1),
    highlightIndex: z.number().optional(),
  }),
  render(props, t) {
    const nodes = props.nodes.map((n: any, i: number, a: any[]) =>
      `<div class="node anim"><span class="node-ic">${esc(n.icon)}</span>${esc(n.label)}</div>${i < a.length - 1 ? `<div class="arrow anim">→</div>` : ""}`).join("");
    return `<div class="eyebrow anim" style="color:${t.teal};align-self:flex-start"><i style="background:${t.teal}"></i>${esc(props.eyebrow)}</div>
      <div class="flow">${nodes}</div>`;
  },
};
