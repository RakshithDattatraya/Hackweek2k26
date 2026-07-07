import { z } from "zod";
import type { SceneComponent } from "./types";
import { esc } from "./types";

// escape everything, then re-allow only <b>/</b>
const fmt = (s: string) => esc(s).replace(/&lt;(\/?)b&gt;/g, "<$1b>");

export const slack: SceneComponent = {
  propsSchema: z.object({
    channel: z.string(), members: z.number(),
    messages: z.array(z.object({
      color: z.string(), initials: z.string(), name: z.string(), time: z.string(), text: z.string(),
    })).min(1),
  }),
  render(props, t) {
    const rows = props.messages.map((m: any) => `
      <div class="anim srow"><div class="savatar" style="background:${esc(m.color)}">${esc(m.initials)}</div>
        <div class="scol"><div class="shead"><span class="sname">${esc(m.name)}</span><span class="stime">${esc(m.time)}</span></div>
          <div class="stext">${fmt(m.text)}</div></div></div>`).join("");
    return `<div class="slackwin">
      <div class="slack-sb"><div class="sb-ws">UiPath <span class="sb-caret">⌄</span></div>
        <div class="sb-sec">Channels</div>
        <div class="sb-ch"><span class="sb-hash">#</span>general</div>
        <div class="sb-ch active"><span class="sb-hash">#</span>${esc(props.channel)}</div>
        <div class="sb-ch"><span class="sb-hash">#</span>customer-wins</div></div>
      <div class="slack-main"><div class="slack-hd"><span class="hd-ch"># ${esc(props.channel)}</span><span class="hd-meta">&nbsp;&nbsp;${props.members} members</span></div>
        <div class="slack-body">${rows}</div>
        <div class="slack-compose"><span>Message #${esc(props.channel)}</span></div></div></div>`;
  },
};
