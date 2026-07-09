import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CANDIDATES = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];

/** Find a usable Chrome/Chromium binary: CHROME_PATH env, macOS default, then PATH. Null if none. */
export function resolveChrome(): string | null {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  if (existsSync(MAC_CHROME)) return MAC_CHROME;
  for (const c of CANDIDATES) {
    try {
      const p = execFileSync("which", [c]).toString().trim();
      if (p && existsSync(p)) return p;
    } catch { /* not found */ }
  }
  return null;
}

/** Render htmlPath (absolute) to pdfPath (absolute) via headless Chrome. Returns false if no Chrome. */
export function htmlToPdf(htmlPath: string, pdfPath: string): boolean {
  const chrome = resolveChrome();
  if (!chrome) return false;
  execFileSync(chrome, [
    "--headless=new", "--disable-gpu", "--no-sandbox",
    "--virtual-time-budget=3000",
    `--print-to-pdf=${pdfPath}`, "--no-pdf-header-footer",
    `file://${htmlPath}`,
  ], { stdio: "ignore" });
  return true;
}
