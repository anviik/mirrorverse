"""Neo4j Aura client — stores and retrieves decision graphs."""
import os
from contextlib import contextmanager

from neo4j import GraphDatabase

from schemas import Decision, DecisionGraph, GraphEdge, GraphNode

VALID_NODE_TYPES = {"Decision", "Assumption", "Evidence", "Outcome", "Preference"}
VALID_EDGE_TYPES = {"SUPPORTS", "CONTRADICTS", "CAUSED_BY", "INFLUENCES"}

_driver = None


def get_driver():
    global _driver
    if _driver is None:
        uri = os.environ["NEO4J_URI"]
        user = os.environ.get("NEO4J_USER", "neo4j")
        password = os.environ["NEO4J_PASSWORD"]
        _driver = GraphDatabase.driver(uri, auth=(user, password))
    return _driver


@contextmanager
def session():
    with get_driver().session() as s:
        yield s


def store_decision(decision: Decision) -> None:
    """Persist a decision and its graph. Nodes are namespaced by decision_id."""
    with session() as s:
        s.execute_write(_write_decision_tx, decision)


def _write_decision_tx(tx, decision: Decision):
    tx.run(
        """
        MERGE (d:DecisionRoot {decision_id: $id})
        SET d.user_id = $user_id, d.title = $title, d.description = $description,
            d.tags = $tags, d.context = $context, d.status = $status,
            d.created_at = $created_at
        """,
        id=decision.decision_id,
        user_id=decision.user_id,
        title=decision.title,
        description=decision.description,
        tags=[t.value for t in decision.tags],
        context=decision.context or "",
        status=decision.status.value,
        created_at=decision.created_at.isoformat(),
    )
    for node in decision.graph.nodes:
        node_type = node.type if node.type in VALID_NODE_TYPES else "Evidence"
        # Node label comes from a validated allowlist — safe to interpolate
        tx.run(
            f"""
            MATCH (d:DecisionRoot {{decision_id: $did}})
            MERGE (n:{node_type} {{node_id: $nid, decision_id: $did}})
            SET n.label = $label
            MERGE (d)-[:HAS_NODE]->(n)
            """,
            did=decision.decision_id,
            nid=node.id,
            label=node.label,
        )
    for edge in decision.graph.edges:
        edge_type = edge.type if edge.type in VALID_EDGE_TYPES else "INFLUENCES"
        tx.run(
            f"""
            MATCH (a {{node_id: $src, decision_id: $did}})
            MATCH (b {{node_id: $tgt, decision_id: $did}})
            MERGE (a)-[:{edge_type}]->(b)
            """,
            did=decision.decision_id,
            src=edge.source,
            tgt=edge.target,
        )


def fetch_decision(decision_id: str) -> Decision | None:
    with session() as s:
        root = s.run(
            "MATCH (d:DecisionRoot {decision_id: $id}) RETURN d",
            id=decision_id,
        ).single()
        if root is None:
            return None
        d = root["d"]

        nodes = s.run(
            """
            MATCH (:DecisionRoot {decision_id: $id})-[:HAS_NODE]->(n)
            RETURN n.node_id AS id, labels(n)[0] AS type, n.label AS label
            """,
            id=decision_id,
        ).data()
        edges = s.run(
            """
            MATCH (a)-[r]->(b)
            WHERE a.decision_id = $id AND b.decision_id = $id
              AND type(r) IN $edge_types
            RETURN a.node_id AS source, b.node_id AS target, type(r) AS type
            """,
            id=decision_id,
            edge_types=list(VALID_EDGE_TYPES),
        ).data()

    return Decision(
        decision_id=decision_id,
        user_id=d["user_id"],
        title=d["title"],
        description=d["description"],
        tags=d.get("tags", []),
        context=d.get("context") or None,
        status=d["status"],
        created_at=d["created_at"],
        graph=DecisionGraph(
            nodes=[GraphNode(**n) for n in nodes],
            edges=[GraphEdge(**e) for e in edges],
        ),
    )


def list_decisions(user_id: str = "default") -> list[dict]:
    with session() as s:
        return s.run(
            """
            MATCH (d:DecisionRoot {user_id: $uid})
            RETURN d.decision_id AS decision_id, d.title AS title,
                   d.status AS status, d.tags AS tags, d.created_at AS created_at
            ORDER BY d.created_at DESC
            """,
            uid=user_id,
        ).data()


def store_simulation_result(decision_id: str, result: dict) -> None:
    """Attach a simulation verdict to the decision and mark it simulated."""
    with session() as s:
        s.run(
            """
            MATCH (d:DecisionRoot {decision_id: $id})
            MERGE (d)-[:HAS_RESULT]->(r:SimulationVerdict {decision_id: $id})
            SET r.final_recommendation = $rec, r.confidence = $conf,
                r.key_risks = $risks, r.key_disagreements = $disagreements,
                r.missing_information = $missing,
                r.agent_summaries_json = $agents_json,
                d.status = 'simulated'
            """,
            id=decision_id,
            rec=result["final_recommendation"],
            conf=result["confidence"],
            risks=result.get("key_risks", []),
            disagreements=result.get("key_disagreements", []),
            missing=result.get("missing_information", []),
            agents_json=__import__("json").dumps(result.get("agent_summaries", [])),
        )


def fetch_simulation_result(decision_id: str) -> dict | None:
    import json as _json

    with session() as s:
        row = s.run(
            "MATCH (:DecisionRoot {decision_id: $id})-[:HAS_RESULT]->(r) RETURN r",
            id=decision_id,
        ).single()
    if row is None:
        return None
    r = row["r"]
    return {
        "decision_id": decision_id,
        "final_recommendation": r["final_recommendation"],
        "confidence": r["confidence"],
        "key_risks": list(r.get("key_risks", [])),
        "key_disagreements": list(r.get("key_disagreements", [])),
        "missing_information": list(r.get("missing_information", [])),
        "agent_summaries": _json.loads(r.get("agent_summaries_json", "[]")),
    }


def update_status(decision_id: str, status: str) -> None:
    with session() as s:
        s.run(
            "MATCH (d:DecisionRoot {decision_id: $id}) SET d.status = $status",
            id=decision_id,
            status=status,
        )


def set_mirofish_refs(decision_id: str, project_id: str, graph_id: str) -> None:
    with session() as s:
        s.run(
            """
            MATCH (d:DecisionRoot {decision_id: $id})
            SET d.mirofish_project_id = $pid, d.mirofish_graph_id = $gid
            """,
            id=decision_id, pid=project_id, gid=graph_id,
        )


def get_mirofish_refs(decision_id: str) -> dict | None:
    with session() as s:
        row = s.run(
            """
            MATCH (d:DecisionRoot {decision_id: $id})
            RETURN d.mirofish_project_id AS project_id, d.mirofish_graph_id AS graph_id
            """,
            id=decision_id,
        ).single()
    if row is None or row["graph_id"] is None:
        return None
    return {"project_id": row["project_id"], "graph_id": row["graph_id"]}
