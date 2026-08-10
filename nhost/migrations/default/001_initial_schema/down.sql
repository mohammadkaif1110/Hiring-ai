-- Rollback: drop everything in reverse order

DROP TRIGGER IF EXISTS auto_reset_quota ON organizations;
DROP TRIGGER IF EXISTS set_workflow_triggers_updated_at ON workflow_triggers;
DROP TRIGGER IF EXISTS set_workflow_steps_updated_at ON workflow_steps;
DROP TRIGGER IF EXISTS set_workflows_updated_at ON workflows;
DROP TRIGGER IF EXISTS set_organizations_updated_at ON organizations;
DROP FUNCTION IF EXISTS check_and_reset_quota();
DROP FUNCTION IF EXISTS update_updated_at();

DROP VIEW IF EXISTS org_monthly_usage;

DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS watched_tables;
DROP TABLE IF EXISTS step_runs;
DROP TABLE IF EXISTS workflow_runs;
DROP TABLE IF EXISTS workflow_triggers;
DROP TABLE IF EXISTS workflow_steps;
DROP TABLE IF EXISTS workflows;
DROP TABLE IF EXISTS org_members;
DROP TABLE IF EXISTS organizations;

DROP TYPE IF EXISTS step_status;
DROP TYPE IF EXISTS run_status;
DROP TYPE IF EXISTS trigger_type;
DROP TYPE IF EXISTS step_type;
DROP TYPE IF EXISTS org_role;
