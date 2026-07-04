"""Extract a structured decision graph from raw user text via Claude."""
import json
import os

import anthropic

from schemas import DecisionGraph

MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")

SYSTEM_PROMPT = """You extract decision graphs from user decisions.

Given a decision description, produce a JSON object with:
- "nodes": array of {"id", "type", "label"} where type is one of:
  Decision (the core choice), Assumption (unverified beliefs),
  Evidence (verifiable facts), Outcome (possible results),
  Preference (user values/priorities)
- "edges": array of {"source", "target", "type"} where type is one of:
  SUPPORTS, CONTRADICTS, CAUSED_BY, INFLUENCES

Rules:
- Exactly one Decision node with id "decision".
- 3-8 Assumptions, 2-6 Evidence, 3-8 Outcomes, 2-5 Preferences.
- Every non-Decision node must connect to the graph via at least one edge.
- ids are short snake_case strings; labels are concise human phrases.
- Respond with ONLY the JSON object, no markdown fences or commentary."""


def extract_graph(title: str, description: str, context: str | None = None) -> DecisionGraph:
    client = anthropic.Anthropic()  # uses ANTHROPIC_API_KEY env var
    user_text = f"Decision: {title}\n\nDetails: {description}"
    if context:
        user_text += f"\n\nAdditional context: {context}"

    response = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_text}],
    )
    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1].removeprefix("json").strip()
    data = json.loads(raw)
    # Claude sometimes writes CAUSES for causal edges; normalize to the schema
    for edge in data.get("edges", []):
        if edge.get("type") in ("CAUSES", "CAUSED", "LEADS_TO"):
            edge["type"] = "CAUSED_BY"
    return DecisionGraph(**data)
