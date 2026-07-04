"""Pydantic schemas for Mirrorverse."""
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class DecisionTag(str, Enum):
    career = "career"
    finance = "finance"
    personal = "personal"
    relationships = "relationships"
    projects = "projects"


class DecisionStatus(str, Enum):
    pending = "pending"
    simulated = "simulated"


class Stance(str, Enum):
    approve = "approve"
    reject = "reject"
    uncertain = "uncertain"


class Recommendation(str, Enum):
    accept = "accept"
    reject = "reject"
    uncertain = "uncertain"


class DecisionCreate(BaseModel):
    """Raw user input for a new decision."""
    title: str
    description: str
    tags: list[DecisionTag] = []
    context: Optional[str] = None
    user_id: str = "default"


class GraphNode(BaseModel):
    id: str
    type: str  # Decision | Assumption | Evidence | Outcome | Preference
    label: str
    properties: dict = {}


class GraphEdge(BaseModel):
    source: str
    target: str
    type: str  # SUPPORTS | CONTRADICTS | CAUSED_BY | INFLUENCES
    properties: dict = {}


class DecisionGraph(BaseModel):
    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []


class Decision(BaseModel):
    """A structured decision stored in the graph."""
    decision_id: str
    user_id: str = "default"
    title: str
    description: str
    tags: list[DecisionTag] = []
    context: Optional[str] = None
    status: DecisionStatus = DecisionStatus.pending
    graph: DecisionGraph = Field(default_factory=DecisionGraph)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AgentOutput(BaseModel):
    """One simulation agent's verdict on a decision."""
    agent_name: str
    stance: Stance
    reasoning: str
    confidence: float = Field(ge=0.0, le=1.0)
    assumptions_challenged: list[str] = []


class SimulationResult(BaseModel):
    """Aggregated result of a full multi-agent simulation."""
    decision_id: str
    final_recommendation: Recommendation
    confidence: float = Field(ge=0.0, le=1.0)
    key_risks: list[str] = []
    key_disagreements: list[str] = []
    missing_information: list[str] = []
    agent_summaries: list[AgentOutput] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
