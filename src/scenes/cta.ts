import { z } from "zod";
import type { SceneComponent } from "./types";
import { esc } from "./types";

export const cta: SceneComponent = {
  propsSchema: z.object({ headline: z.string() }),
  render(props, t) {
    return `<div class="ctacard anim"><img class="logo" src="assets/uipath-logo-orange.png" alt="UiPath" /></div>
      <h1 class="anim" style="margin-top:48px;text-align:center">${esc(props.headline)}</h1>`;
  },
};
