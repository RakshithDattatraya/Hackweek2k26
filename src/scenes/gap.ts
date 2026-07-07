import { z } from "zod";
import type { SceneComponent } from "./types";
import { esc } from "./types";

const shore = z.object({ icon: z.string(), title: z.string(), sub: z.string() });

export const gap: SceneComponent = {
  propsSchema: z.object({ eyebrow: z.string(), headline: z.string(), left: shore, right: shore, chasmLabel: z.string() }),
  render(props, t) {
    const panel = (s: any, color: string, tint: string) => `
      <div class="shore anim" style="border-color:${color}"><div class="shore-icon" style="background:${tint};color:${color}">${esc(s.icon)}</div>
        <div class="shore-t">${esc(s.title)}</div><div class="shore-s">${esc(s.sub)}</div></div>`;
    return `<div class="eyebrow anim" style="color:${t.orange}"><i></i>${esc(props.eyebrow)}</div>
      <h1 class="anim" style="margin-bottom:64px">${esc(props.headline)}</h1>
      <div class="gapviz">
        ${panel(props.left, t.teal, "rgba(11,162,179,.15)")}
        <div class="chasm anim"><div class="chasm-dot" style="background:${t.orange}"></div><div class="chasm-line"></div>
          <div class="chasm-lbl">${esc(props.chasmLabel)}</div></div>
        ${panel(props.right, t.orange, "rgba(250,70,22,.15)")}</div>`;
  },
};
