# FlowForge AI — AI Agent Workflow Builder

A mini n8n for chaining AI agent steps, built with **nhost + Hasura + PostgreSQL + GraphQL + Next.js**.

Users inside an organization build workflows out of multiple step types (LLM calls, HTTP requests, conditional branches, approval gates, and more), start them multiple ways (manual, webhook, scheduled, database event), and every action is checked against two separate layers of permissions.

---

## 🚀 Quick Start

### Prerequisites

- **Docker Desktop** — required for nhost local development
- **Node.js** v18+ and npm
- **nhost CLI** — install with:
  ```bash
  curl -sSL https://raw.githubusercontent.com/nhost/nhost/main/cli/get.sh | bash
  ```
  Or via npm: `npm install -g nhost`

### Setup

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd assignment

# 2. Configure secrets
cp nhost/.secrets.example nhost/.secrets
# Edit nhost/.secrets — add your GROQ_API_KEY (or leave as stub)

# 3. Start nhost (Postgres, Hasura, Auth, Functions)
nhost up

# 4. Apply seed data (optional — for demo)
# Open Hasura console at http://localhost:9695
# Run the SQL in nhost/seeds/default/001_seed_data.sql

# 5. Start the frontend
cd frontend
npm install
npm run dev
```

The app will be running at:
- **Frontend**: http://localhost:3000
- **Hasura Console**: http://localhost:9695
- **GraphQL API**: http://localhost:1337/v1/graphql
- **Auth API**: http://localhost:1337/v1/auth

### API Keys

| Key | Required? | How to Get |
|-----|-----------|------------|
| `GROQ_API_KEY` | Optional | [console.groq.com](https://console.groq.com) — free tier |

If no Groq API key is configured, LLM calls use a **stubbed response** with a disclosed 2-second artificial delay. The stub response is clearly marked as simulated.

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js Frontend (React, App Router)                       │
│  ├── Auth (nhost SDK)                                       │
│  ├── GraphQL queries/mutations                              │
│  └── Live polling (2s interval for step-by-step updates)    │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│  Hasura GraphQL Engine                                      │
│  ├── Auto-generated CRUD API                                │
│  ├── Row-level permissions (Layer 1: org+role scoping)      │
│  ├── Actions (triggerWorkflowRun, approveStep, webhook)     │
│  ├── Event Triggers (notify, database_event)                │
│  └── Cron Triggers (scheduled workflows every 5 min)        │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│  nhost Serverless Functions                                 │
│  ├── Workflow Engine (sequential step execution + retry)    │
│  ├── Step Executors (LLM, HTTP, DB write, notify, branch)   │
│  ├── Permission Checks (Layer 2: step-level gating)         │
│  └── Trigger Handlers (webhook, scheduled, DB event)        │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│  PostgreSQL                                                 │
│  ├── organizations, org_members                             │
│  ├── workflows, workflow_steps, workflow_triggers            │
│  ├── workflow_runs, step_runs                               │
│  └── org_monthly_usage (aggregation view)                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Data Model

| Table | Purpose |
|-------|---------|
| `organizations` | Multi-tenant orgs with quota tracking |
| `org_members` | User↔Org mapping with role (owner/editor/viewer) |
| `workflows` | Workflow definitions belonging to an org |
| `workflow_steps` | Ordered steps with type and JSONB config |
| `workflow_triggers` | How workflows start (manual/webhook/scheduled/event) |
| `workflow_runs` | Per-execution record with status tracking |
| `step_runs` | Per-step-per-run record with input/output/approval |
| `org_monthly_usage` | Aggregation view for org-level stats |

---

## 🔒 Two-Layer Permission System

### Layer 1: Org + Role Scoping (Hasura Row-Level Permissions)

Every permission rule scopes through `org_members` to ensure **cross-org isolation**:

- **owner**: Full control — CRUD workflows, steps, triggers, members
- **editor**: Create/edit workflows and steps, trigger runs — no member management
- **viewer**: Read-only, cannot trigger runs

Hasura uses `_exists` checks against `org_members` to verify the caller's org membership and role. An editor in Org A **cannot** see or touch Org B's data, even by guessing IDs directly.

### Layer 2: Step-Level Gating (Action Handler Enforcement)

Enforced in serverless function code, not in database permissions:

- Only **owners** can add `db_write`, `notify`, or `webhook` trigger steps
- Only **owners/editors** can approve `approval_gate` steps
- The `approveStep` handler queries `org_members` to verify the approver's role before resuming the run — this is a **mid-execution decision**, not a simple row operation

---

## ⚡ Step Types

| Type | Description | Retry? |
|------|-------------|--------|
| `llm_call` | Calls Groq LLM API | ✅ 1 retry |
| `http_request` | Generic external API call | ✅ 1 retry |
| `db_write` | Saves data to a table | ❌ |
| `notify` | Sends notification (log/Slack) | ❌ |
| `conditional_branch` | If/else based on previous output | ❌ |
| `approval_gate` | Pauses run for human approval | ❌ |

---

## 🔔 Trigger Types

| Type | Implementation |
|------|----------------|
| Manual | Frontend button → `triggerWorkflowRun` Action |
| Webhook | Hasura Action with `webhook_token` auth |
| Scheduled | Hasura Cron Trigger (every 5 min) |
| Database Event | Hasura Event Trigger on watched table |

---

## 📁 Project Structure

```
assignment/
├── nhost/
│   ├── nhost.toml              # nhost configuration
│   ├── .secrets                # Local secrets (not committed)
│   ├── migrations/default/     # PostgreSQL migrations
│   ├── metadata/               # Hasura metadata (tables, actions, triggers, permissions)
│   └── seeds/default/          # Seed data for demo
├── functions/                  # nhost serverless functions
│   ├── trigger-workflow-run.ts # Action: start a workflow
│   ├── approve-step.ts         # Action: approve an approval gate
│   ├── webhook-trigger.ts      # Action: inbound webhook
│   ├── scheduled-trigger.ts    # Cron handler
│   ├── event-trigger-run.ts    # DB event handler
│   └── _lib/                   # Shared utilities
│       ├── workflow-engine.ts  # Core execution engine
│       ├── step-executors.ts   # Step type implementations
│       ├── permissions.ts      # Layer 2 permission checks
│       └── graphql-client.ts   # Admin GraphQL client
├── frontend/                   # Next.js application
│   └── src/
│       ├── app/                # Pages (dashboard, workflows, auth, settings)
│       ├── components/         # React components (Sidebar, AuthProvider)
│       └── lib/                # nhost client, GraphQL operations
├── package.json                # Root deps for functions
├── tsconfig.json               # TypeScript config
└── README.md                   # This file
```

---

## 🎬 Final Task Scenario

The demo proves all 6 requirements:

1. **Two separate organizations** — Acme Corp and Beta Inc
2. **Multi-step workflow** — LLM call → conditional branch → HTTP request → approval gate → notify
3. **Dual triggers** — manual button + webhook endpoint
4. **Approval gate** — run pauses, owner/editor approves
5. **Live status** — 2-second polling shows step-by-step progress with no refresh
6. **Cross-org isolation** — Org B user sees nothing from Org A

---

## 📝 License

MIT
