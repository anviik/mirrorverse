"""7-agent debate engine: 2 rounds + aggregation, all via Claude."""
import json
import os
from concurrent.futures import ThreadPoolExecutor

import anthropic

from agents.personas import AGENTS

MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")

AGENT_OUTPUT_FORMAT = """Respond with ONLY a JSON object (no markdown fences):
{
  "stance": "approve" | "reject" | "uncertain",
  "reasoning": "<3-6 sentences of your analysis>",
  "confidence": <float 0.0-1.0>,
  "assumptions_challenged": ["<assumption you dispute or flag>", ...]
}"""


def _parse_json(raw: str) -> dict:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1].removeprefix("json").strip()
    return json.loads(raw)


def _call_agent(client, agent: dict, user_content: str) -> dict:
    response = client.messages.create(
        model=MODEL,
        max_tokens=1500,
        system=(
            f"You are the {agent['name']} in a panel of AI agents evaluating a "
            f"personal decision. {agent['focus']}\n\n{AGENT_OUTPUT_FORMAT}"
        ),
        messages=[{"role": "user", "content": user_content}],
    )
    result = _parse_json(response.content[0].text)
    result["agent_name"] = agent["name"]
    result.setdefault("stance", "uncertain")
    result.setdefault("confidence", 0.5)
    result.setdefault("assumptions_challenged", [])
    return result


def _round_prompt(decision_graph: dict, memory_context: dict) -> str:
    return (
        "DECISION GRAPH (structured representation of the user's decision):\n"
        f"{json.dumps(decision_graph, indent=1)}\n\n"
        "USER MEMORY CONTEXT (known preferences, patterns, history):\n"
        f"{json.dumps(memory_context, indent=1)}\n\n"
        "Evaluate this decision from your specialty."
    )


def run_debate(decision_graph: dict, memory_context: dict) -> dict:
    """Run 2 debate rounds across all 7 agents; return outputs of both rounds."""
    client = anthropic.Anthropic()
    base_prompt = _round_prompt(decision_graph, memory_context)

    with ThreadPoolExecutor(max_workers=7) as pool:
        round1 = list(pool.map(
            lambda a: _call_agent(client, a, base_prompt), AGENTS
        ))

        peers_summary = json.dumps(
            [
                {
                    "agent": r["agent_name"],
                    "stance": r["stance"],
                    "confidence": r["confidence"],
                    "reasoning": r["reasoning"],
                }
                for r in round1
            ],
            indent=1,
        )
        round2_prompt = (
            base_prompt
            + "\n\nROUND 1 — here is what every agent on the panel concluded:\n"
            + peers_summary
            + "\n\nRound 2: revise your stance in light of the other agents' "
            "arguments. Directly engage with the strongest disagreement with "
            "your position. You may change or hold your stance."
        )
        round2 = list(pool.map(
            lambda a: _call_agent(client, a, round2_prompt), AGENTS
        ))

    return {"round1": round1, "round2": round2}


def aggregate(decision_graph: dict, debate: dict) -> dict:
    """Final Claude call: synthesize the debate into the structured verdict."""
    client = anthropic.Anthropic()
    response = client.messages.create(
        model=MODEL,
        max_tokens=2000,
        system=(
            "You are the synthesis judge for a 7-agent decision debate. Given the "
            "final (round 2) agent outputs, produce the aggregate verdict.\n"
            "Respond with ONLY a JSON object (no markdown fences):\n"
            "{\n"
            '  "final_recommendation": "accept" | "reject" | "uncertain",\n'
            '  "confidence": <float 0.0-1.0>,\n'
            '  "key_risks": ["<risk>", ...],\n'
            '  "key_disagreements": ["<where agents conflicted and why>", ...],\n'
            '  "missing_information": ["<info that would change the verdict>", ...]\n'
            "}"
        ),
        messages=[{
            "role": "user",
            "content": (
                "DECISION GRAPH:\n" + json.dumps(decision_graph, indent=1)
                + "\n\nFINAL AGENT OUTPUTS (after 2 debate rounds):\n"
                + json.dumps(debate["round2"], indent=1)
            ),
        }],
    )
    verdict = _parse_json(response.content[0].text)
    verdict["agent_summaries"] = debate["round2"]
    return verdict
