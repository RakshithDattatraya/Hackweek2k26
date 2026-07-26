export type GithubReader = { getReleaseByTag(owner: string, repo: string, tag: string): Promise<{ name: string; body: string }> };
export type ReleaseContext = { owner: string; repo: string; tag: string; name: string; body: string; prs: { number: number; title: string; url: string }[] };

export function parseReleaseUrl(url: string): { owner: string; repo: string; tag: string } {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/releases\/tag\/([^/?#]+)/)
        ?? url.match(/github\.com\/([^/]+)\/([^/]+)\/releases#release-([^/?#]+)/);
  if (!m) throw new Error(`Not a release URL: ${url}`);
  return { owner: m[1], repo: m[2], tag: m[3] };
}

export function parseReleaseNotes(body: string): { prs: { number: number; title: string; url: string }[] } {
  const prs: { number: number; title: string; url: string }[] = [];
  const re = /^\s*[*-]\s*(.+?)\s+by\s+@\S+\s+in\s+(https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+))/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) prs.push({ title: m[1].trim(), url: m[2], number: Number(m[3]) });
  return { prs };
}

export async function fetchReleaseContext(url: string, gh: GithubReader): Promise<ReleaseContext> {
  const { owner, repo, tag } = parseReleaseUrl(url);
  const { name, body } = await gh.getReleaseByTag(owner, repo, tag);
  return { owner, repo, tag, name, body, prs: parseReleaseNotes(body).prs };
}
