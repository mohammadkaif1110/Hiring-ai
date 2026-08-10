# Design Write-Up: AI Agent Workflow Builder

## Schema Reasoning

The schema is designed around a strict organizational hierarchy: **org → members → workflows → steps/triggers → runs → step_runs**. Every data entity belongs to an organization, and every access path must go through `org_members` to prove the caller has a role in that org.

**Key design decisions:**

- **JSONB `config` columns** on `workflow_steps` and `workflow_triggers` provide maximum flexibility for different step/trigger types without requiring schema changes. Each step type interprets its config differently (e.g., `llm_call` expects `prompt`, `model`, `temperature`; `http_request` expects `url`, `method`, `body_template`).
- **`workflow_runs` carries `org_id`** as a denormalized column. This is intentional — it enables Hasura to scope run access directly via `org_members` without joining through `workflows` for every permission check, which is critical for subscription performance.
- **`step_runs` has both `approved_by` and `approved_at`** to create an audit trail of who approved an approval gate and when — this data is visible in the step timeline.
- **`org_monthly_usage`** is a Postgres VIEW (not materialized) that computes per-org stats on the fly. This keeps it always fresh without needing a refresh mechanism.

## Two Permission Layers — How They Differ

### Layer 1: Org + Role Scoping (Declarative, in Hasura)

This layer is enforced **declaratively** through Hasura's row-level permissions. Every table has `select`/`insert`/`update`/`delete` permissions that use `_exists` checks against `org_members` to verify:
1. The caller (`X-Hasura-User-Id`) is a member of the row's org
2. The caller's role meets the minimum required level

This means an Org B user who guesses an Org A workflow UUID will get zero rows back — the permission check is appended as a SQL `WHERE` clause, making it impossible to leak data through direct ID access. This layer handles the "who can see what" question.

### Layer 2: Step-Level Gating (Imperative, in Action Handlers)

This layer is enforced **imperatively** inside the serverless function code. It handles decisions that can't be expressed as simple row operations:

- **Step type restrictions**: When the `triggerWorkflowRun` handler executes, the step-level permissions are already baked in (only owners can _create_ `db_write`/`notify` steps in the first place). But the webhook trigger — which is also an owner-only creation — has its token validated in the handler.
- **Approval gate authorization**: When `approveStep` is called, the handler explicitly queries `org_members` to check that the approver is an `owner` or `editor` in the run's org. This is a **mid-execution decision** — the workflow is paused, a different user comes along to approve, and we need to verify their authority in real time, not at insert time.

The two layers are complementary: Layer 1 prevents unauthorized _data access_, Layer 2 prevents unauthorized _actions on in-flight executions_.

## Approval Gate Pause/Resume Implementation

The approval gate uses a **cooperative pause/resume** pattern:

1. **Pause**: When the workflow engine encounters an `approval_gate` step, it:
   - Sets the `step_run.status` to `awaiting_approval`
   - Sets the `workflow_run.status` to `paused`
   - **Returns** from the execution function — the engine does not spin-wait or hold a connection

2. **Waiting**: The paused state is visible via the live polling subscription. The frontend shows a "paused, awaiting approval" indicator and renders an "Approve & Continue" button only for users with `owner` or `editor` role.

3. **Resume**: When an authorized user calls `approveStep`:
   - The handler verifies the caller's role in the run's org (Layer 2)
   - Sets `step_run.approved_by`, `approved_at`, and `status = completed`
   - Calls `executeWorkflow(runId, nextStepOrder)` to resume from the step after the gate
   - The workflow engine picks up where it left off, using previously stored step outputs

This approach is stateless — no long-lived connections or server processes hold the pause state. The database is the single source of truth, and any function invocation can resume from any point.
