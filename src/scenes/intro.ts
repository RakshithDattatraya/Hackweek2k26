import { z } from "zod";
import type { SceneComponent } from "./types";
import { esc } from "./types";

export const intro: SceneComponent = {
  propsSchema: z.object({ tagline: z.string() }),
  render(props, t) {
    return `<img class="anim logo big" src="assets/uipath-logo-orange.png" alt="UiPath" />
      <div class="anim introtag">${esc(props.tagline)}</div>`;
  },
};
