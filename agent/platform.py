from __future__ import annotations
from dataclasses import dataclass, field
from typing import Protocol

@dataclass
class ReleaseNotes: name: str; body: str

class Platform(Protocol):
    # ingest
    def get_pr(self, url: str) -> dict: ...
    def get_jira(self, key: str) -> dict: ...
    def get_release(self, owner: str, repo: str, tag: str) -> ReleaseNotes: ...
    # render (invokes the TS pipeline as an Orchestrator process)
    def invoke_render(self, kind: str, plan: dict) -> dict: ...   # returns {video_url?, onepager_url, digest?}
    # storage + entity
    def storage_put(self, local_path: str, key: str) -> str: ...  # returns URL
    def entity_create(self, record: dict) -> str: ...             # returns entity id
    def entity_update(self, entity_id: str, patch: dict) -> None: ...
    # human gate
    def raise_approval(self, entity_id: str, summary: dict) -> "Approval": ...
    # publish
    def publish(self, channels: list[str], payload: dict) -> list[str]: ...  # returns published channels

@dataclass
class Approval: status: str; approved_by: str = ""; channels: list[str] = field(default_factory=list); note: str = ""

class FakePlatform:
    """In-memory Platform for tests; records calls, returns canned data."""
    def __init__(self, approval: Approval | None = None):
        self.entities: dict[str, dict] = {}; self.published: list[str] = []
        self._approval = approval or Approval(status="approved", approved_by="tester", channels=["slack"])
        self._id = 0
    def get_pr(self, url): return {"diff": "d", "commits": ["c"], "title": "t", "body": "b", "url": url}
    def get_jira(self, key): return {"key": key, "summary": "s", "acceptance": "a"}
    def get_release(self, owner, repo, tag): return ReleaseNotes(name=f"{repo} {tag}", body="* T by @a in https://github.com/o/r/pull/1")
    def invoke_render(self, kind, plan): return {"onepager_url": "file:///op.pdf", **({"video_url": "file:///v.mp4"} if kind == "feature" else {"digest": {"slack": "s"}, "digest_url": "file:///digest.html"})}
    def storage_put(self, local_path, key): return f"https://bucket/{key}"
    def entity_create(self, record): self._id += 1; eid = f"e{self._id}"; self.entities[eid] = dict(record); return eid
    def entity_update(self, entity_id, patch): self.entities[entity_id].update(patch)
    def raise_approval(self, entity_id, summary): return self._approval
    def publish(self, channels, payload): self.published += channels; return channels
