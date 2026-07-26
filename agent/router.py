"""Classify a GitHub source URL into a pipeline entry point. Pure; no network."""
import re


def classify(url: str) -> str:
    """
    Classify a GitHub source URL into one of three categories.

    Args:
        url: A GitHub URL string.

    Returns:
        "release" if URL matches /releases/tag/<tag> or /releases#release-
        "feature" if URL matches /pull/<digits> or /commit/<6-40 hex chars>
        "unknown" otherwise
    """
    u = url.strip()

    # Release: /releases/tag/<anything> or /releases#release-
    if re.search(r"/releases/tag/[^/]+", u) or re.search(r"/releases#release-", u):
        return "release"

    # Feature: /pull/<digits> or /commit/<6-40 hex chars> (case-insensitive)
    if re.search(r"/pull/\d+", u) or re.search(r"/commit/[0-9a-f]{6,40}", u, re.IGNORECASE):
        return "feature"

    return "unknown"
