"""MiroFish enrichment adapter.

Feeds a decision into MiroFish's real pipeline (ontology → Zep knowledge graph)
in a background thread so its rich entity graph becomes available to the mobile
app for visualization. Never blocks the main simulation; failures are recorded
but non-fatal.
"""
import json
import os
import threading
import time

import httpx

from graph import neo4j_client

MIROFISH_URL = os.environ.get("MIROFISH_URL", "http://localhost:5001")
BUILD_POLL_SECONDS = 10
BUILD_TIMEOUT_SECONDS = 15 * 60

# decision_id -> {"status": ..., "project_id": ..., "graph_id": ..., "error": ...}
_enrichments: dict[str, dict] = {}
_lock = threading.Lock()


def get_enrichment(decision_id: str) -> dict:
    with _lock:
        return dict(_enrichments.get(decision_id, {"status": "not_started"}))


def _set(decision_id: str, **fields):
    with _lock:
        _enrichments.setdefault(decision_id, {}).update(fields)


def _seed_text(title: str, description: str, graph_json: dict) -> str:
    lines = [
        f"# Decision Analysis: {title}", "",
        f"## Description", description, "",
        "## Structured decision graph",
    ]
    for n in graph_json.get("nodes", []):
        lines.append(f"- [{n['type']}] {n['label']}")
    lines.append("")
    lines.append("## Relationships")
    labels = {n["id"]: n["label"] for n in graph_json.get("nodes", [])}
    for e in graph_json.get("edges", []):
        lines.append(
            f"- \"{labels.get(e['source'], e['source'])}\" {e['type']} "
            f"\"{labels.get(e['target'], e['target'])}\""
        )
    return "\n".join(lines)


def start_enrichment(decision_id: str, title: str, description: str, graph_json: dict) -> None:
    """Fire-and-forget MiroFish pipeline for this decision."""
    if get_enrichment(decision_id).get("status") in ("building", "ready"):
        return
    _set(decision_id, status="starting", error=None)
    threading.Thread(
        target=_run, args=(decision_id, title, description, graph_json), daemon=True
    ).start()


def _run(decision_id: str, title: str, description: str, graph_json: dict):
    try:
        with httpx.Client(base_url=MIROFISH_URL, timeout=120) as client:
            client.get("/health").raise_for_status()

            # 1. Upload seed material, get ontology + project
            seed = _seed_text(title, description, graph_json)
            resp = client.post(
                "/api/graph/ontology/generate",
                files={"files": (f"decision_{decision_id}.md", seed.encode(), "text/markdown")},
                data={
                    "simulation_requirement": (
                        f"Predict how the decision '{title}' plays out for this "
                        "person: likely outcomes, social and career dynamics, and "
                        "second-order effects."
                    ),
                    "project_name": f"mirrorverse_{decision_id}",
                },
            )
            resp.raise_for_status()
            body = resp.json()
            if not body.get("success"):
                raise RuntimeError(f"ontology/generate failed: {body.get('error')}")
            project_id = body["data"]["project_id"]
            _set(decision_id, status="building", project_id=project_id)

            # 2. Build the Zep knowledge graph
            resp = client.post("/api/graph/build", json={"project_id": project_id})
            resp.raise_for_status()
            body = resp.json()
            if not body.get("success"):
                raise RuntimeError(f"graph/build failed: {body.get('error')}")
            task_id = body["data"]["task_id"]

            # 3. Poll until built
            deadline = time.time() + BUILD_TIMEOUT_SECONDS
            graph_id = None
            while time.time() < deadline:
                time.sleep(BUILD_POLL_SECONDS)
                task = client.get(f"/api/graph/task/{task_id}").json().get("data", {})
                status = (task.get("status") or "").lower()
                if status in ("completed", "success", "done", "finished"):
                    graph_id = task.get("graph_id") or task.get("result", {}).get("graph_id")
                    break
                if status in ("failed", "error"):
                    raise RuntimeError(f"graph build failed: {task.get('error')}")
            if graph_id is None:
                # fall back to the project record
                proj = client.get(f"/api/graph/project/{project_id}").json().get("data", {})
                graph_id = proj.get("graph_id")
            if not graph_id:
                raise RuntimeError("graph build finished but no graph_id found")

            _set(decision_id, status="ready", graph_id=graph_id)
            try:
                neo4j_client.set_mirofish_refs(decision_id, project_id, graph_id)
            except Exception:
                pass
    except Exception as e:
        _set(decision_id, status="failed", error=str(e))


def fetch_entities(decision_id: str) -> dict:
    """Proxy MiroFish's entity graph for the frontend."""
    info = get_enrichment(decision_id)
    if info.get("status") != "ready":
        # maybe a previous run stored refs in Neo4j
        refs = neo4j_client.get_mirofish_refs(decision_id)
        if refs and refs.get("graph_id"):
            info = {"status": "ready", **refs}
        else:
            return {"status": info.get("status", "not_started"), "entities": None,
                    "error": info.get("error")}
    with httpx.Client(base_url=MIROFISH_URL, timeout=60) as client:
        resp = client.get(f"/api/simulation/entities/{info['graph_id']}")
        body = resp.json()
        if not body.get("success"):
            return {"status": "failed", "entities": None, "error": body.get("error")}
        return {"status": "ready", "entities": body["data"]}
