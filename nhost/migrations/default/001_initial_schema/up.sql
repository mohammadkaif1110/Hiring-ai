-- ============================================================
-- AI Agent Workflow Builder — Database Schema
-- ============================================================

-- ---- ENUMS ----

CREATE TYPE org_role AS ENUM ('owner', 'editor', 'viewer');
CREATE TYPE step_type AS ENUM ('llm_call', 'http_request', 'db_write', 'notify', 'conditional_branch', 'approval_gate');
CREATE TYPE trigger_type AS ENUM ('manual', 'webhook', 'scheduled', 'database_event');
CREATE TYPE run_status AS ENUM ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled');
CREATE TYPE step_status AS ENUM ('pending', 'running', 'completed', 'failed', 'skipped', 'awaiting_approval');

-- ---- TABLES ----

-- Organizations
CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  quota_limit INT NOT NULL DEFAULT 100,
  quota_used  INT NOT NULL DEFAULT 0,
  quota_reset_at TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', NOW()) + INTERVAL '1 month',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Organization Members (user ↔ org join with role)
CREATE TABLE org_members (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role     org_role NOT NULL DEFAULT 'viewer',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, org_id)
);

-- Workflows
CREATE TABLE workflows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workflow Steps (ordered nodes in a workflow)
CREATE TABLE workflow_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  step_order  INT NOT NULL,
  step_type   step_type NOT NULL,
  name        TEXT NOT NULL,
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workflow_id, step_order)
);

-- Workflow Triggers (how a workflow gets started)
CREATE TABLE workflow_triggers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  trigger_type trigger_type NOT NULL,
  config       JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  webhook_token TEXT UNIQUE,  -- for webhook triggers
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workflow Runs (one per execution)
CREATE TABLE workflow_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id   UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status        run_status NOT NULL DEFAULT 'pending',
  triggered_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_type  trigger_type NOT NULL DEFAULT 'manual',
  error_message TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

-- Step Runs (one per step per run)
CREATE TABLE step_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id  UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  workflow_step_id UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  status           step_status NOT NULL DEFAULT 'pending',
  input            JSONB DEFAULT '{}'::jsonb,
  output           JSONB DEFAULT '{}'::jsonb,
  error            TEXT,
  attempt_count    INT NOT NULL DEFAULT 0,
  approved_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at      TIMESTAMPTZ,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  UNIQUE(workflow_run_id, workflow_step_id)
);

-- Watched Tables (for database event triggers)
CREATE TABLE watched_tables (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  table_name   TEXT NOT NULL,
  workflow_id  UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications (for notify step implemented as Event Trigger)
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel     TEXT NOT NULL,
  message     TEXT NOT NULL,
  metadata    JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- INDEXES ----

CREATE INDEX idx_org_members_user_id ON org_members(user_id);
CREATE INDEX idx_org_members_org_id ON org_members(org_id);
CREATE INDEX idx_workflows_org_id ON workflows(org_id);
CREATE INDEX idx_workflow_steps_workflow_id ON workflow_steps(workflow_id);
CREATE INDEX idx_workflow_triggers_workflow_id ON workflow_triggers(workflow_id);
CREATE INDEX idx_workflow_triggers_webhook_token ON workflow_triggers(webhook_token);
CREATE INDEX idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
CREATE INDEX idx_workflow_runs_org_id ON workflow_runs(org_id);
CREATE INDEX idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX idx_step_runs_workflow_run_id ON step_runs(workflow_run_id);
CREATE INDEX idx_step_runs_status ON step_runs(status);

-- ---- VIEWS ----

-- Org-level aggregation: monthly usage stats
CREATE OR REPLACE VIEW org_monthly_usage AS
SELECT
  o.id AS org_id,
  o.name AS org_name,
  o.quota_limit,
  o.quota_used,
  o.quota_limit - o.quota_used AS quota_remaining,
  COUNT(wr.id)::INT AS runs_this_month,
  ROUND(AVG(
    CASE
      WHEN wr.completed_at IS NOT NULL THEN
        EXTRACT(EPOCH FROM (wr.completed_at - wr.started_at))
      ELSE NULL
    END
  )::NUMERIC, 2) AS avg_run_duration_seconds
FROM organizations o
LEFT JOIN workflow_runs wr
  ON wr.org_id = o.id
  AND wr.started_at >= date_trunc('month', NOW())
GROUP BY o.id, o.name, o.quota_limit, o.quota_used;

-- ---- TRIGGERS for updated_at ----

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_workflow_steps_updated_at
  BEFORE UPDATE ON workflow_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_workflow_triggers_updated_at
  BEFORE UPDATE ON workflow_triggers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---- QUOTA RESET FUNCTION ----
-- Resets quota_used to 0 when a new month starts
CREATE OR REPLACE FUNCTION check_and_reset_quota()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quota_reset_at <= NOW() THEN
    NEW.quota_used := 0;
    NEW.quota_reset_at := date_trunc('month', NOW()) + INTERVAL '1 month';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_reset_quota
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION check_and_reset_quota();
