export type SrtWord = { text: string; start: number; end: number };

function fmt(t: number): string {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const rem = ms % 1000;
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(rem, 3)}`;
}

/** Group words into caption cues (~42 chars / 8 words / sentence-end) and format as SRT. */
export function wordsToSrt(words: SrtWord[]): string {
  const cues: { start: number; end: number; text: string }[] = [];
  let cur: SrtWord[] = [], len = 0;
  const flush = () => {
    if (cur.length) { cues.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.text).join(" ") }); cur = []; }
  };
  for (const w of words) {
    cur.push(w); len += w.text.length + 1;
    if (len >= 42 || cur.length >= 8 || /[.?!]$/.test(w.text.trim())) { flush(); len = 0; }
  }
  flush();
  return cues.map((c, i) => `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`).join("\n");
}
