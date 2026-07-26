/** Classify a GitHub source URL into a pipeline entry point. Pure; no network. */
export function classifySource(url: string): "feature" | "release" | "unknown" {
  const u = url.trim();
  if (/\/releases\/tag\/[^/]+/.test(u) || /\/releases#release-/.test(u)) return "release";
  if (/\/pull\/\d+/.test(u) || /\/commit\/[0-9a-f]{6,40}/i.test(u)) return "feature";
  return "unknown";
}
