"""Mem0 client — user memory: past decisions, preferences, patterns, goals."""
import os

from mem0 import MemoryClient

_client = None


def get_client() -> MemoryClient:
    global _client
    if _client is None:
        _client = MemoryClient(api_key=os.environ["MEM0_API_KEY"])
    return _client


def add_memory(user_id: str, messages: list[dict], metadata: dict | None = None) -> dict:
    """Store conversation-style messages; Mem0 extracts durable facts."""
    return get_client().add(messages, user_id=user_id, metadata=metadata or {})


def record_decision(user_id: str, title: str, description: str, tags: list[str]) -> dict:
    """Record that the user is weighing a decision — feeds behavioral patterns."""
    return add_memory(
        user_id,
        [{
            "role": "user",
            "content": (
                f"I'm considering a decision: {title}. {description} "
                f"(categories: {', '.join(tags) if tags else 'general'})"
            ),
        }],
        metadata={"kind": "decision"},
    )


def record_outcome(user_id: str, title: str, recommendation: str, confidence: float) -> dict:
    """Record a simulation verdict so future simulations know the history."""
    return add_memory(
        user_id,
        [{
            "role": "assistant",
            "content": (
                f"Simulation verdict for '{title}': {recommendation} "
                f"(confidence {confidence:.0%})."
            ),
        }],
        metadata={"kind": "simulation_outcome"},
    )


def get_memory_context(user_id: str, query: str, limit: int = 10) -> dict:
    """Fetch memories relevant to a decision, grouped for prompt injection."""
    results = get_client().search(query, filters={"user_id": user_id}, limit=limit)
    if isinstance(results, dict):
        results = results.get("results", [])
    memories = [r["memory"] for r in results] if results else []
    return {
        "user_id": user_id,
        "relevant_memories": memories,
        "memory_count": len(memories),
    }


def get_all_memories(user_id: str) -> list[dict]:
    results = get_client().get_all(filters={"user_id": user_id})
    return results or []
