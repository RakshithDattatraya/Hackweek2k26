from agent.platform import FakePlatform, Approval
from agent.orchestrator import run

class FakeBrain:
    def author(self, kind, ctx, custom_prompt):
        return ({"feature_name": "X"} if kind == "feature" else {"version": "v1"}, "reviewed")  # (plan, claim_status)

def classify(url): return "release" if "/releases/" in url else "feature"

def test_release_path_publishes_onepager_and_digest_no_video():
    p = FakePlatform(Approval(status="approved", approved_by="t", channels=["slack", "confluence"]))
    rec = run("https://github.com/o/r/releases/tag/v1", None, p, FakeBrain(), classify)
    assert rec["type"] == "release"
    assert rec["video_url"] is None
    assert set(p.published) == {"slack", "confluence"}
    assert p.entities[rec["entity_id"]]["approval_status"] == "approved"

def test_high_claim_flag_blocks_publish():
    class Flagging(FakeBrain):
        def author(self, kind, ctx, cp): return ({"version": "v1"}, "flags")
    p = FakePlatform()
    rec = run("https://github.com/o/r/releases/tag/v1", None, p, Flagging(), classify)
    assert p.published == []
    assert rec["claim_check_status"] == "flags"

def test_rejected_approval_does_not_publish():
    p = FakePlatform(Approval(status="rejected", approved_by="t"))
    run("https://github.com/o/r/pull/5", None, p, FakeBrain(), classify)
    assert p.published == []
