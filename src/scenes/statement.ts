import { z } from "zod";
import type { SceneComponent } from "./types";
import { esc } from "./types";

export const statement: SceneComponent = {
  propsSchema: z.object({
    eyebrow: z.string().optional(), eyebrowColor: z.string().optional(),
    headline: z.string(), highlight: z.string().optional(), sub: z.string().optional(),
  }),
  render(props, t) {
    let headline = esc(props.headline);
    if (props.highlight) {
      const h = esc(props.highlight);
      headline = headline.replace(h, `<span style="color:${t.teal}">${h}</span>`);
    }
    const eyebrow = props.eyebrow
      ? `<div class="eyebrow anim" style="color:${props.eyebrowColor || t.teal}"><i style="background:${props.eyebrowColor || t.teal}"></i>${esc(props.eyebrow)}</div>` : "";
    const sub = props.sub ? `<p class="sub anim">${esc(props.sub)}</p>` : "";
    return `${eyebrow}<h1 class="anim">${headline}</h1>${sub}`;
  },
};
