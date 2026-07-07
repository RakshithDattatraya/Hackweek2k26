import type { z } from "zod";
import type { BrandTokens } from "../brand/token-resolver";
import { escapeHtml } from "../compose/scene-card";

export interface SceneComponent {
  propsSchema: z.ZodType;
  render(props: any, tokens: BrandTokens): string;
}

export const esc = escapeHtml;
