import { test, expect } from "bun:test";
import { parseReleaseUrl, parseReleaseNotes, fetchReleaseContext } from "./release-context";

test("parses owner/repo/tag from a release URL", () => {
  expect(parseReleaseUrl("https://github.com/UiPath/fins-vertical-solution/releases/tag/v2604.195.0"))
    .toEqual({ owner: "UiPath", repo: "fins-vertical-solution", tag: "v2604.195.0" });
  expect(parseReleaseUrl("https://github.com/o/r/releases#release-v1.2.3").tag).toBe("v1.2.3");
});

test("parses PR links from auto-generated release notes", () => {
  const body = "## What's Changed\n* Add public app toggle by @a in https://github.com/o/r/pull/1423\n* Fix crash by @b in https://github.com/o/r/pull/1424\n";
  expect(parseReleaseNotes(body).prs).toEqual([
    { number: 1423, title: "Add public app toggle", url: "https://github.com/o/r/pull/1423" },
    { number: 1424, title: "Fix crash", url: "https://github.com/o/r/pull/1424" },
  ]);
});

test("fetchReleaseContext composes URL + reader + notes", async () => {
  const gh = { async getReleaseByTag() { return { name: "FinS v2604.195.0", body: "* T by @a in https://github.com/o/r/pull/9" }; } };
  const ctx = await fetchReleaseContext("https://github.com/o/r/releases/tag/v2604.195.0", gh);
  expect(ctx.tag).toBe("v2604.195.0");
  expect(ctx.prs[0].number).toBe(9);
});
