"""Create/recreate the EnablementAsset Data Service entity (the agent's asset library).

Data Service can't add fields to an existing entity via the SDK, so to change the schema we
recreate it. Field names are alphanumeric camelCase (underscores are rejected).

    python setup_entity.py            # create if missing
    python setup_entity.py recreate   # delete if present, recreate, and seed the 2 demo records

Run after `uipath auth --staging` (tokens expire ~1h).
"""
from __future__ import annotations
import sys
from dotenv import load_dotenv
load_dotenv(dotenv_path="./.env")
from uipath.platform import UiPath
from uipath.platform.entities import EntityCreateFieldOptions as F, EntityCreateOptions, EntityFieldDataType as T

ENTITY = "EnablementAsset"


def _str(name, limit=2000):
    return F(field_name=name, type=T.STRING, display_name=name, length_limit=limit)


def _text(name):
    return F(field_name=name, type=T.MULTILINE_TEXT, display_name=name)


FIELDS = [
    _str("assetType", 40),          # feature | release
    _str("title", 400),
    _str("product", 200),           # the UiPath product/solution
    _text("description"),           # blurb shown under the heading (what it's about)
    _str("sourceRef"),              # PR / release URL
    _text("customPrompt"),
    _str("videoUrl"), _str("onepagerUrl"), _str("digestUrl"),  # bucket:// references
    _str("qaStatus", 40), _str("claimCheckStatus", 40),
]

SEED = [
    {
        "assetType": "release",
        "title": "Release v2604.195.0",
        "product": "UiPath Financial Services (FinS) Vertical Solution",
        "description": "HELOC goes end-to-end: a new address agent, agentic solution testing, per-customer config, and full observability.",
        "sourceRef": "https://github.com/UiPath/fins-vertical-solution/releases/tag/v2604.195.0",
        "onepagerUrl": "bucket://amplify-assets/amplify/v2604.195.0/onepager.html",
        "digestUrl": "bucket://amplify-assets/amplify/v2604.195.0/digest.html",
        "qaStatus": "passed", "claimCheckStatus": "reviewed",
    },
    {
        "assetType": "feature",
        "title": "Amplify — Feature to Enablement Pipeline",
        "product": "UiPath — Amplify",
        "description": "On merge, auto-generate premium enablement (a ~2-min video + a matching one-pager) so sales knows what shipped, where it fits, and how to sell it.",
        "sourceRef": "https://github.com/RakshithDattatraya/Hackweek2k26",
        "videoUrl": "bucket://amplify-assets/amplify/amplify-demo/video.mp4",
        "onepagerUrl": "bucket://amplify-assets/amplify/amplify-demo/onepager.pdf",
        "qaStatus": "passed", "claimCheckStatus": "reviewed",
    },
]


def main() -> None:
    recreate = len(sys.argv) > 1 and sys.argv[1] == "recreate"
    sdk = UiPath()
    existing = next((e for e in sdk.entities.list_entities() if e.name == ENTITY), None)
    if existing and recreate:
        sdk.entities.delete_entity(existing.id)
        print(f"deleted existing {ENTITY} ({existing.id})")
        existing = None
    if existing:
        print(f"{ENTITY} already exists ({existing.id}); pass 'recreate' to rebuild. No changes.")
        return
    eid = sdk.entities.create_entity(
        ENTITY, FIELDS,
        EntityCreateOptions(display_name=ENTITY, description="Amplify-generated enablement assets + metadata"),
    )
    print(f"created {ENTITY} ({eid}) with fields:", [f.field_name for f in FIELDS])
    if recreate:
        ent = sdk.entities.retrieve_by_name(ENTITY)
        for r in SEED:
            rec = sdk.entities.insert_record(ent.id, r)
            print(f"  seeded [{r['assetType']}] {r['title']} -> {getattr(rec,'id',getattr(rec,'Id','?'))}")


if __name__ == "__main__":
    main()
