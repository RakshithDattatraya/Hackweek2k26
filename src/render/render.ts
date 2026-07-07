import { execFileSync } from "node:child_process";

export function render(projectDir: string, outRelPath: string): void {
  const nodeBin = process.env.HYPERFRAMES_NODE_BIN;
  const env = nodeBin ? { ...process.env, PATH: `${nodeBin}:${process.env.PATH}` } : process.env;
  execFileSync("npx", ["-y", "hyperframes@latest", "render", "-o", outRelPath], {
    cwd: projectDir,
    stdio: "inherit",
    env,
  });
}
