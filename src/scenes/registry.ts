import type { SceneComponent } from "./types";
import type { BrandTokens } from "../brand/token-resolver";
import type { SceneV2, VideoPlanV2 } from "../content-director/plan-schema";
import { intro } from "./intro";
import { slack } from "./slack";
import { statement } from "./statement";
import { gap } from "./gap";
import { flow } from "./flow";
import { capability } from "./capability";
import { bigstat } from "./bigstat";
import { cta } from "./cta";

export const SCENE_REGISTRY: Record<string, SceneComponent> = {
  intro, slack, statement, gap, flow, capability, bigstat, cta,
};

export function renderScene(scene: SceneV2, tokens: BrandTokens): string {
  const comp = SCENE_REGISTRY[scene.component];
  if (!comp) throw new Error(`Unknown component "${scene.component}" (scene ${scene.id})`);
  const props = comp.propsSchema.parse(scene.props);
  return comp.render(props, tokens);
}

export function validateScenePlan(plan: VideoPlanV2): void {
  for (const s of plan.scenes) {
    const comp = SCENE_REGISTRY[s.component];
    if (!comp) throw new Error(`Unknown component "${s.component}" (scene ${s.id})`);
    const r = comp.propsSchema.safeParse(s.props);
    if (!r.success) throw new Error(`Invalid props for scene ${s.id} (${s.component}): ${r.error.message}`);
  }
}
