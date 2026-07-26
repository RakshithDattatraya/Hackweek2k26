from __future__ import annotations
from .platform import Platform, Approval

def run(source_url: str, custom_prompt, platform: Platform, brain, classify) -> dict:
    kind = classify(source_url)
    if kind == "unknown":
        raise ValueError(f"Unrecognized source URL: {source_url}")

    # 1. ingest
    if kind == "feature":
        ctx = {"pr": platform.get_pr(source_url)}
    else:
        from urllib.parse import urlparse
        parts = urlparse(source_url).path.strip("/").split("/")
        owner, repo, tag = parts[0], parts[1], parts[-1]
        notes = platform.get_release(owner, repo, tag)
        ctx = {"release": {"owner": owner, "repo": repo, "tag": tag, "name": notes.name, "body": notes.body}}

    # 2. brain authors the plan + runs claim-check (grounded; custom_prompt = steering)
    plan, claim_status = brain.author(kind, ctx, custom_prompt)

    # 3. render (only this kind's artifacts)
    out = platform.invoke_render(kind, plan)

    # 4. store media in a bucket, metadata in the entity
    record = {
        "type": kind,
        "title": plan.get("feature_name") or f"Release {plan.get('version')}",
        "source_ref": source_url,
        "custom_prompt": custom_prompt or "",
        "video_url": out.get("video_url"),
        "onepager_url": out.get("onepager_url"),
        "digest_url": None,
        "qa_status": "passed",
        "claim_check_status": claim_status,
        "approval_status": "draft",
        "channels_published": "",
    }
    entity_id = platform.entity_create(record)
    record["entity_id"] = entity_id

    # 5. human gate — never auto-publish a high-severity claim flag
    if claim_status == "flags":
        platform.entity_update(entity_id, {"approval_status": "draft"})
        return record
    approval: Approval = platform.raise_approval(entity_id, {k: record[k] for k in ("title", "onepager_url", "video_url")})
    record["approval_status"] = approval.status
    platform.entity_update(entity_id, {"approval_status": approval.status, "approved_by": approval.approved_by})

    # 6. publish only on approval
    if approval.status == "approved":
        payload = {"kind": kind, "urls": {k: record[k] for k in ("onepager_url", "video_url")}}
        published = platform.publish(approval.channels, payload)
        record["channels_published"] = ",".join(published)
        platform.entity_update(entity_id, {"channels_published": record["channels_published"]})
    return record
