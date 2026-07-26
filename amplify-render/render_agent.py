"""LangGraph wrapper that makes render.py publishable as the `amplify-render` UiPath process.

The agent calls `sdk.processes.invoke("amplify-render", {"kind", "plan"})`; this graph's single
node runs the tested `render()` (build via bun + upload to bucket) and returns the artifact URLs.

MUST run on a robot/machine with the toolchain (Node/Bun/headless Chrome/FFmpeg) and the repo
checked out — set REPO_DIR + HYPERFRAMES_NODE_BIN there. It will NOT work in the serverless
runtime (no toolchain); bind the Orchestrator process to your UNATTENDED robot's machine.
"""
from __future__ import annotations
from typing import Optional

from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, START, END

from render import render  # tested build+upload logic, unchanged


class Input(BaseModel):
    kind: str = Field(description='"feature" | "release"')
    plan: str = Field(description="Plan JSON as a string.")


class State(Input):
    video_url: Optional[str] = None
    onepager_url: Optional[str] = None
    digest_url: Optional[str] = None


class Output(BaseModel):
    video_url: Optional[str] = None
    onepager_url: Optional[str] = None
    digest_url: Optional[str] = None


def do_render(state: State) -> dict:
    out = render({"kind": state.kind, "plan": state.plan})
    return {k: out.get(k) for k in ("video_url", "onepager_url", "digest_url")}


builder = StateGraph(State, input=Input, output=Output)
builder.add_node("render", do_render)
builder.add_edge(START, "render")
builder.add_edge("render", END)
graph = builder.compile()
