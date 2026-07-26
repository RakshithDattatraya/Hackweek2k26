import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Word = { text: string; start: number; end: number };

/**
 * Transcribe a VO wav (via hyperframes/Whisper) and build the caption HTML overlay
 * (cues + per-word spans) for the composition. Best-effort: returns "" if transcription
 * is unavailable. Caption text is HTML-escaped (&<>) since it is injected into the
 * composition markup rendered by headless Chrome.
 */
export function captionHtmlFromVo(outDir: string, voRelPath = "audio/vo-norm.wav"): string {
  try {
    const nodeBin = process.env.HYPERFRAMES_NODE_BIN;
    const hfEnv = nodeBin ? { ...process.env, PATH: `${nodeBin}:${process.env.PATH}` } : process.env;
    execFileSync("npx", ["-y", "hyperframes@latest", "transcribe", voRelPath, "--json", "--optional"], { cwd: outDir, env: hfEnv, stdio: "ignore" });
    const words = JSON.parse(readFileSync(join(outDir, "audio/transcript.json"), "utf8")) as Word[];
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
    const cues: { words: Word[]; start: number; end: number }[] = [];
    let cur: Word[] = [], len = 0;
    const flush = () => { if (cur.length) { cues.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end }); cur = []; } };
    for (const w of words) { cur.push(w); len += w.text.length + 1; if (len >= 42 || cur.length >= 8 || /[.?!]$/.test(w.text.trim())) { flush(); len = 0; } }
    flush();
    return cues.map((c) => `    <div class="cap" data-s="${c.start}" data-e="${c.end}">${c.words.map((w) => `<span class="capw" data-t="${w.start}">${esc(w.text)}</span>`).join(" ")}</div>`).join("\n");
  } catch { return ""; }
}
