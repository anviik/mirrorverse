# 🪞 Mirrorverse

> **A decision flight-simulator**: structure any life choice as a graph, let 7 adversarial AI agents debate it across rounds, and get back the risks, contradictions, and missing information — personalized by memory of how you actually decide.

**Every other AI tool gives you an answer. This one gives you an argument — and shows you exactly where it's weakest.**

## What it does

Give it a messy human decision — *"Should I take the NYC job offer that pays more but moves me away from family?"* — and Mirrorverse does three things a chatbot can't:

1. **Makes your thinking visible.** Claude decomposes the decision into a typed knowledge graph: what's *Evidence* (verifiable), what's an *Assumption* you're treating as fact, which *Outcomes* hang on which assumptions, and where your *Preferences* contradict each other. Seeing "this whole plan rests on two unverified assumptions" is the product.

2. **Stress-tests it with 7 adversarial experts who argue with each other.** Not one AI giving a mushy balanced take — a panel that debates across 2 rounds, sees each other's arguments, and revises stances under pressure:

   | Agent | Role |
   |---|---|
   | ⚠️ **Risk Analyst** | failure modes and downside scenarios |
   | 📈 **Career Optimizer** | long-term trajectory, optionality, network effects |
   | 💰 **Financial Modeler** | 1/3/5-year outcomes, COL, opportunity cost |
   | 🔮 **Future Self** | who you become in 5–10 years under each branch |
   | 😈 **Contrarian** | actively tries to disprove the decision *and* the other agents |
   | 🔍 **Reality Checker** | validates assumptions against real-world constraints |
   | 💚 **Emotional Wellbeing** | stress, fulfillment, regret risk |

   In observed runs the debate measurably changes positions — e.g. the Career Optimizer opened at *approve* and was argued down to *uncertain* by the Risk Analyst and Contrarian in round 2.

3. **It knows you.** User memory (Mem0) is injected into every agent's context — the panel that told one user to reject the NYC offer did so partly because it remembered *"you tend to regret decisions made too quickly"* and *"you strongly value family proximity."* Over time it becomes a decision advisor with a memory of your patterns.

**Real-world analogues:** automated red-teaming / war-gaming, an investment-committee skeptic for life choices, a behavioral-econ premortem on demand. The scaled-up versions of this idea (policy scenario simulation, synthetic focus groups) are active industry products — Mirrorverse is the consumer-sized one.

## Architecture

```
┌─────────────────┐         ┌───────────────────────────────────────────┐
│  React Native    │  HTTP   │  FastAPI backend (port 8000)              │
│  (Expo, 5        ├────────►│                                           │
│  screens)        │         │  LangGraph StateGraph:                    │
│                  │         │   extract_graph → retrieve_memory →       │
│  • Home          │         │   build_reasoning_state →                 │
│  • Create        │         │   mirofish_simulation (7-agent debate,    │
│  • Graph (React  │         │     2 rounds, parallel Claude calls) →    │
│    Flow WebView) │         │   aggregate_results → store_results      │
│  • Results       │         └───────┬───────────┬───────────┬──────────┘
│  • Insights      │                 │           │           │
└─────────────────┘          ┌───────▼───┐ ┌─────▼────┐ ┌────▼─────────────┐
                             │  Neo4j    │ │  Mem0    │ │  MiroFish (5001) │
                             │  Aura     │ │  (user   │ │  OSS society sim │
                             │  (graphs, │ │  memory) │ │  → Zep knowledge │
                             │  verdicts)│ │          │ │  graph enrichment│
                             └───────────┘ └──────────┘ └──────────────────┘
```

- **Core simulation** = the 7-agent debate engine (fast: ~60–90 s, ~15 concurrent/sequenced Claude calls, cents per run).
- **MiroFish** ([666ghj/MiroFish](https://github.com/666ghj/MiroFish), powered by CAMEL-AI's OASIS) runs as a separate microservice. Each decision is fed to it asynchronously as seed material; it builds a rich Zep knowledge graph that the mobile app renders as the "Deep Graph" view. It never blocks the core flow — if it's down, the app fully works.
- This repo includes a small compatibility patch to MiroFish's LLM client (`mirofish/backend/app/utils/llm_client.py`) so its `json_object` response format degrades gracefully on Anthropic's OpenAI-compatible endpoint.

## Repo structure

```
mirrorverse/
├── backend/
│   ├── main.py                  # FastAPI app + endpoints
│   ├── schemas.py               # Pydantic models
│   ├── agents/                  # 7 personas + debate engine
│   ├── graph/                   # Claude graph extraction + Neo4j client
│   ├── memory/                  # Mem0 client
│   ├── workflows/               # LangGraph workflow + MiroFish adapter
│   ├── requirements.txt
│   └── Dockerfile
├── mobile/                      # Expo app (SDK 54): App.tsx, screens/, lib/
├── mirofish/                    # cloned MiroFish (separate service)
├── docker-compose.yml           # backend + mirofish together
├── cloudbuild.yaml              # GCP Cloud Run deployment
└── .env.example
```

## API

| Endpoint | What it does |
|---|---|
| `GET /health` | liveness |
| `POST /create-decision` | raw text → Claude graph extraction → Neo4j; returns `decision_id` + graph |
| `GET /decision/{id}` | full decision graph |
| `GET /decisions` | list for dashboard |
| `POST /run-simulation` | kicks off the LangGraph workflow (async); poll for result |
| `GET /simulation/{id}` | status + structured verdict |
| `GET /mirofish-graph/{id}` | MiroFish deep-graph entities for visualization |
| `POST /update-memory` / `GET /memory/{user}` | Mem0 store / retrieve |

Verdict shape:

```json
{
  "final_recommendation": "accept | reject | uncertain",
  "confidence": 0.65,
  "key_risks": ["..."],
  "key_disagreements": ["..."],
  "missing_information": ["..."],
  "agent_summaries": [{ "agent_name", "stance", "reasoning", "confidence", "assumptions_challenged" }]
}
```

## Setup

Prereqs: Python 3.11/3.12 + [uv](https://docs.astral.sh/uv/), Node 18+, free accounts for [Neo4j Aura](https://console.neo4j.io), [Mem0](https://app.mem0.ai), [Zep](https://app.getzep.com), and an [Anthropic API key](https://console.anthropic.com).

```bash
# 1. Environment
cp .env.example .env          # fill in every key
# note: new Aura instances use the INSTANCE ID as NEO4J_USER, not "neo4j"

# 2. MiroFish (separate service)
cd mirofish && cp .env.example .env
#   LLM_API_KEY   = your Anthropic key
#   LLM_BASE_URL  = https://api.anthropic.com/v1
#   LLM_MODEL_NAME= claude-sonnet-4-6
#   ZEP_API_KEY   = your Zep key
npm run setup:all && npm run dev     # frontend :3000, backend :5001

# 3. Backend
cd backend
uv venv --python 3.12 .venv && uv pip install -r requirements.txt --python .venv/bin/python
.venv/bin/uvicorn main:app --port 8000

# 4. Mobile
cd mobile && npm install && npx expo start   # scan QR with Expo Go
# (--tunnel if your network blocks phone↔laptop traffic)
```

Or run backend + MiroFish together with Docker:

```bash
docker compose up --build
```

## Deploy to GCP (Cloud Run)

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  secretmanager.googleapis.com artifactregistry.googleapis.com

gcloud artifacts repositories create mirrorverse \
  --repository-format=docker --location=us-central1

# Secrets (repeat for neo4j-uri, neo4j-user, neo4j-password, mem0-api-key)
printf '%s' "$ANTHROPIC_API_KEY" | \
  gcloud secrets create anthropic-api-key --data-file=-

# Grant the Cloud Run service account access
gcloud projects add-iam-policy-binding $GOOGLE_CLOUD_PROJECT \
  --member="serviceAccount:$(gcloud projects describe $GOOGLE_CLOUD_PROJECT \
  --format='value(projectNumber)')-compute@developer.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor

# Build + deploy
gcloud builds submit --config cloudbuild.yaml
```

Cloud Build compiles the image **in the cloud** — no local Docker needed. Point the mobile app's `BACKEND_TUNNEL_URL` (in `mobile/lib/api.ts`) at the Cloud Run URL.

## Demo walkthrough (90 seconds)

1. **Create**: type *"Should I take a job offer in NYC that pays more but requires relocation?"* → watch Claude structure it into an 18-node graph.
2. **Graph screen**: point at a yellow node — "that's an *assumption* I was treating as a fact." Toggle **Deep Graph** for MiroFish's knowledge web.
3. **Run Simulation** → "7 agents debating…" → verdict card.
4. **The money shot**: open the Career Optimizer's card — it *changed its stance* between rounds after the Risk Analyst's rebuttal. The disagreement is the product.
5. End on **Missing Information**: the app doesn't just answer — it tells you what would change the answer.

## Acknowledgments

- [MiroFish](https://github.com/666ghj/MiroFish) — swarm-intelligence simulation engine (Shanda Group / CAMEL-AI OASIS)
- LangGraph, Neo4j Aura, Mem0, Zep, Anthropic Claude
