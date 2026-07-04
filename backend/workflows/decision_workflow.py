"""LangGraph orchestration: decision → graph → memory → simulation → verdict."""
import json
import os
import threading
from typing import TypedDict

import httpx
from langgraph.graph import END, StateGraph

from agents import debate
from graph import extractor, neo4j_client
from memory import mem0_client

MIROFISH_URL = os.environ.get("MIROFISH_URL", "http://localhost:5001")


class AgentState(TypedDict):
    decision_id: str
    raw_input: str
    decision_graph: dict
    memory_context: dict
    simulation_result: dict
    final_recommendation: str
    confidence: float
    key_risks: list
    key_disagreements: list
    missing_information: list
    agent_summaries: list


def extract_graph_node(state: AgentState) -> dict:
    """Parse the decision into a structured graph (reuse stored graph if present)."""
    existing = neo4j_client.fetch_decision(state["decision_id"])
    if existing and existing.graph.nodes:
        return {"decision_graph": existing.graph.model_dump()}
    graph = extractor.extract_graph(state["raw_input"], state["raw_input"])
    return {"decision_graph": graph.model_dump()}


def retrieve_memory_node(state: AgentState) -> dict:
    try:
        ctx = mem0_client.get_memory_context("default", state["raw_input"])
    except Exception as e:
        ctx = {"relevant_memories": [], "memory_count": 0, "error": str(e)}
    return {"memory_context": ctx}


def build_reasoning_state_node(state: AgentState) -> dict:
    """Combine graph + memory into the reasoning payload the agents consume."""
    return {
        "memory_context": {
            **state["memory_context"],
            "decision_summary": state["raw_input"],
        }
    }


def mirofish_simulation_node(state: AgentState) -> dict:
    """Run the 7-agent debate (core sim) + trigger MiroFish enrichment async."""
    from workflows import mirofish_adapter

    try:
        mirofish_adapter.start_enrichment(
            state["decision_id"], state["raw_input"], state["raw_input"],
            state["decision_graph"],
        )
    except Exception:
        pass  # enrichment is best-effort
    debate_result = debate.run_debate(state["decision_graph"], state["memory_context"])
    return {"simulation_result": debate_result}


def aggregate_results_node(state: AgentState) -> dict:
    verdict = debate.aggregate(state["decision_graph"], state["simulation_result"])
    return {
        "final_recommendation": verdict["final_recommendation"],
        "confidence": verdict["confidence"],
        "key_risks": verdict.get("key_risks", []),
        "key_disagreements": verdict.get("key_disagreements", []),
        "missing_information": verdict.get("missing_information", []),
        "agent_summaries": verdict.get("agent_summaries", []),
    }


def store_results_node(state: AgentState) -> dict:
    result = {
        "final_recommendation": state["final_recommendation"],
        "confidence": state["confidence"],
        "key_risks": state["key_risks"],
        "key_disagreements": state["key_disagreements"],
        "missing_information": state["missing_information"],
        "agent_summaries": state["agent_summaries"],
    }
    neo4j_client.store_simulation_result(state["decision_id"], result)
    try:
        mem0_client.record_outcome(
            "default", state["raw_input"],
            state["final_recommendation"], state["confidence"],
        )
    except Exception:
        pass  # memory write is best-effort
    return {}


def build_workflow():
    wf = StateGraph(AgentState)
    wf.add_node("extract_graph", extract_graph_node)
    wf.add_node("retrieve_memory", retrieve_memory_node)
    wf.add_node("build_reasoning_state", build_reasoning_state_node)
    wf.add_node("mirofish_simulation", mirofish_simulation_node)
    wf.add_node("aggregate_results", aggregate_results_node)
    wf.add_node("store_results", store_results_node)

    wf.set_entry_point("extract_graph")
    wf.add_edge("extract_graph", "retrieve_memory")
    wf.add_edge("retrieve_memory", "build_reasoning_state")
    wf.add_edge("build_reasoning_state", "mirofish_simulation")
    wf.add_edge("mirofish_simulation", "aggregate_results")
    wf.add_edge("aggregate_results", "store_results")
    wf.add_edge("store_results", END)
    return wf.compile()


workflow = build_workflow()


def run_simulation(decision_id: str, raw_input: str) -> AgentState:
    initial: AgentState = {
        "decision_id": decision_id,
        "raw_input": raw_input,
        "decision_graph": {},
        "memory_context": {},
        "simulation_result": {},
        "final_recommendation": "",
        "confidence": 0.0,
        "key_risks": [],
        "key_disagreements": [],
        "missing_information": [],
        "agent_summaries": [],
    }
    return workflow.invoke(initial)


if __name__ == "__main__":
    import sys
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
    did = sys.argv[1] if len(sys.argv) > 1 else "6a04eaa3"
    text = sys.argv[2] if len(sys.argv) > 2 else (
        "Should I take a job offer in NYC that pays more but requires relocation?"
    )
    final = run_simulation(did, text)
    printable = {k: v for k, v in final.items() if k != "simulation_result"}
    print(json.dumps(printable, indent=2, default=str))
