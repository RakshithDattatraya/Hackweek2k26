import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type PrContext = {
  branch: string; headSha: string; commits: string[];
  diffFiles: string[]; diff: string; title: string; body: string;
};

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd }).toString();
}

/** Derive feature ("PR") context from the current branch: commit subjects + diff vs baseBranch. */
export function getPrContext(repoRoot: string = process.cwd(), baseBranch = "main"): PrContext {
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot).trim();
  const headSha = git(["rev-parse", "HEAD"], repoRoot).trim();

  let logOut = "";
  try { logOut = git(["log", "--format=%s%n%b%x00", `${baseBranch}..HEAD`], repoRoot); }
  catch { logOut = git(["log", "-20", "--format=%s%n%b%x00"], repoRoot); }
  const blocks = logOut.split("\0").map((s) => s.trim()).filter(Boolean);
  const commits = blocks.map((b) => b.split("\n")[0]);
  const title = commits[0] ?? branch;
  const body = blocks.join("\n\n");

  let diffFiles: string[] = [], diff = "";
  try {
    diffFiles = git(["diff", "--name-only", `${baseBranch}...HEAD`], repoRoot).split("\n").map((s) => s.trim()).filter(Boolean);
    diff = git(["diff", `${baseBranch}...HEAD`], repoRoot);
  } catch { /* base missing → leave empty */ }

  return { branch, headSha, commits, diffFiles, diff, title, body };
}

const VIDEO_RE = /\.(mp4|mov|webm|m4v)$/i;

/** First changed file that is a video and exists on disk (absolute path), else null. */
export function detectDemoVideo(diffFiles: string[], repoRoot: string = process.cwd()): string | null {
  for (const f of diffFiles) {
    if (VIDEO_RE.test(f)) {
      const abs = join(repoRoot, f);
      if (existsSync(abs)) return abs;
    }
  }
  return null;
}
