"""Mirrorverse backend — FastAPI entry point."""
import os
import threading
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Load root .env (one level up) so backend shares config with the whole repo
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from graph import extractor, neo4j_client  # noqa: E402
from memory import mem0_client  # noqa: E402
from pydantic import BaseModel  # noqa: E402
from schemas import Decision, DecisionCreate  # noqa: E402


class MemoryUpdate(BaseModel):
    user_id: str = "default"
    content: str
    kind: str = "note"  # note | preference | goal | pattern


class SimulationRequest(BaseModel):
    decision_id: str


# decision_id -> "running" | "done" | "failed: <err>"
_sim_status: dict[str, str] = {}

app = FastAPI(
    title="Mirrorverse API",
    description="AI decision simulation backend",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # mobile dev client; tighten for production
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"service": "Mirrorverse Backend", "status": "ok"}


@app.post("/create-decision")
def create_decision(payload: DecisionCreate):
    graph = extractor.extract_graph(payload.title, payload.description, payload.context)
    decision = Decision(
        decision_id=str(uuid.uuid4())[:8],
        user_id=payload.user_id,
        title=payload.title,
        description=payload.description,
        tags=payload.tags,
        context=payload.context,
        graph=graph,
    )
    neo4j_client.store_decision(decision)
    return {"decision_id": decision.decision_id, "graph": graph.model_dump()}


@app.post("/run-simulation")
def run_simulation(payload: SimulationRequest):
    decision = neo4j_client.fetch_decision(payload.decision_id)
    if decision is None:
        raise HTTPException(status_code=404, detail="Decision not found")
    if _sim_status.get(payload.decision_id) == "running":
        return {"decision_id": payload.decision_id, "status": "running"}

    from workflows import decision_workflow

    raw = f"{decision.title}. {decision.description}"

    def _job():
        try:
            decision_workflow.run_simulation(payload.decision_id, raw)
            _sim_status[payload.decision_id] = "done"
        except Exception as e:
            _sim_status[payload.decision_id] = f"failed: {e}"

    _sim_status[payload.decision_id] = "running"
    threading.Thread(target=_job, daemon=True).start()
    return {"decision_id": payload.decision_id, "status": "running"}


@app.get("/simulation/{decision_id}")
def get_simulation(decision_id: str):
    status = _sim_status.get(decision_id)
    result = neo4j_client.fetch_simulation_result(decision_id)
    if result is not None and status in (None, "done"):
        return {"status": "done", "result": result}
    if status is None:
        return {"status": "not_started", "result": None}
    return {"status": status, "result": None}


@app.get("/mirofish-graph/{decision_id}")
def get_mirofish_graph(decision_id: str):
    from workflows import mirofish_adapter

    return mirofish_adapter.fetch_entities(decision_id)


@app.post("/update-memory")
def update_memory(payload: MemoryUpdate):
    result = mem0_client.add_memory(
        payload.user_id,
        [{"role": "user", "content": payload.content}],
        metadata={"kind": payload.kind},
    )
    return {"status": "stored", "result": result}


@app.get("/memory/{user_id}")
def get_memory(user_id: str, query: str = ""):
    if query:
        return mem0_client.get_memory_context(user_id, query)
    return {"memories": mem0_client.get_all_memories(user_id)}


@app.get("/decisions")
def get_decisions(user_id: str = "default"):
    return neo4j_client.list_decisions(user_id)


@app.get("/decision/{decision_id}")
def get_decision(decision_id: str):
    decision = neo4j_client.fetch_decision(decision_id)
    if decision is None:
        raise HTTPException(status_code=404, detail="Decision not found")
    return decision


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
