import { z } from "zod";
import type { SceneComponent } from "./types";
import { esc } from "./types";

export const capability: SceneComponent = {
  propsSchema: z.object({
    eyebrow: z.string(),
    items: z.array(z.object({ icon: z.string(), title: z.string(), desc: z.string() })).min(1),
  }),
  render(props, t) {
    const items = props.items.map((it: any) =>
      `<li class="anim"><span class="capic">${esc(it.icon)}</span><span class="captx"><b>${esc(it.title)}</b><span class="capd">${esc(it.desc)}</span></span></li>`).join("");
    return `<div class="eyebrow anim" style="color:${t.teal};align-self:flex-start"><i style="background:${t.teal}"></i>${esc(props.eyebrow)}</div>
      <ul class="caps">${items}</ul>`;
  },
};
