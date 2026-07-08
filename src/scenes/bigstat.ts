import { z } from "zod";
import type { SceneComponent } from "./types";
import { esc } from "./types";

export const bigstat: SceneComponent = {
  propsSchema: z.object({ eyebrow: z.string(), number: z.string(), unit: z.string().optional(), caption: z.string() }),
  render(props, t) {
    const unit = props.unit ? `<span class="bigstat-unit" style="color:${t.orange}">${esc(props.unit)}</span>` : "";
    return `<div class="eyebrow anim" style="color:${t.teal}"><i style="background:${t.teal}"></i>${esc(props.eyebrow)}</div>
      <div class="bigstat-num anim" style="color:${t.orange}">${esc(props.number)}${unit}</div>
      <p class="sub anim">${esc(props.caption)}</p>`;
  },
};
