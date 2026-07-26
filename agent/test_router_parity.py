"""Parity test: Python router.classify(url) matches TS classifySource(url)."""
import pytest
from agent.router import classify


def test_release_urls_classify_as_release():
    """Release URLs (tag/ or #release-) -> 'release'."""
    assert classify("https://github.com/UiPath/fins-vertical-solution/releases/tag/v2604.195.0") == "release"
    assert classify("https://github.com/UiPath/fins-vertical-solution/releases#release-v2604.195.0") == "release"


def test_pr_merge_urls_classify_as_feature():
    """PR and commit URLs (pull/\d+ or commit/<hex>) -> 'feature'."""
    assert classify("https://github.com/UiPath/fins-vertical-solution/pull/1423") == "feature"
    assert classify("https://github.com/UiPath/fins-vertical-solution/commit/abc123") == "feature"


def test_unrecognized_urls_are_unknown():
    """Unrecognized URLs -> 'unknown'."""
    assert classify("https://github.com/UiPath/fins-vertical-solution") == "unknown"
    assert classify("not-a-url") == "unknown"
