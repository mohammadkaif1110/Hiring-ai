// ---- Queries ----

export const GET_USER_ORGS = `
  query GetUserOrgs($userId: uuid!) {
    org_members(where: { user_id: { _eq: $userId } }) {
      id
      role
      organization {
        id
        name
        slug
        quota_limit
        quota_used
        quota_reset_at
      }
    }
  }
`;

export const GET_ORG_WORKFLOWS = `
  query GetOrgWorkflows($orgId: uuid!) {
    workflows(
      where: { org_id: { _eq: $orgId } }
      order_by: { created_at: desc }
    ) {
      id
      name
      description
      is_active
      created_at
      updated_at
      workflow_steps(order_by: { step_order: asc }) {
        id
        step_order
        step_type
        name
        config
      }
      workflow_triggers {
        id
        trigger_type
        config
        is_active
        webhook_token
      }
      workflow_runs(limit: 1, order_by: { started_at: desc }) {
        id
        status
        started_at
        completed_at
        trigger_type
      }
    }
  }
`;

export const GET_WORKFLOW_DETAIL = `
  query GetWorkflowDetail($workflowId: uuid!) {
    workflows_by_pk(id: $workflowId) {
      id
      name
      description
      is_active
      org_id
      created_at
      workflow_steps(order_by: { step_order: asc }) {
        id
        step_order
        step_type
        name
        config
      }
      workflow_triggers {
        id
        trigger_type
        config
        is_active
        webhook_token
      }
    }
  }
`;

export const GET_WORKFLOW_RUNS = `
  query GetWorkflowRuns($workflowId: uuid!) {
    workflow_runs(
      where: { workflow_id: { _eq: $workflowId } }
      order_by: { started_at: desc }
      limit: 20
    ) {
      id
      status
      trigger_type
      started_at
      completed_at
      error_message
      step_runs(order_by: { workflow_step: { step_order: asc } }) {
        id
        status
        attempt_count
        started_at
        completed_at
        workflow_step {
          step_order
          step_type
          name
        }
      }
    }
  }
`;

export const GET_ORG_MEMBERS = `
  query GetOrgMembers($orgId: uuid!) {
    org_members(where: { org_id: { _eq: $orgId } }) {
      id
      role
      joined_at
      user {
        id
        displayName
        email
      }
    }
  }
`;

export const GET_ORG_USAGE = `
  query GetOrgUsage($orgId: uuid!) {
    organizations_by_pk(id: $orgId) {
      id
      name
      quota_limit
      quota_used
      quota_reset_at
    }
  }
`;

// ---- Mutations ----

export const CREATE_ORGANIZATION = `
  mutation CreateOrganization($name: String!, $slug: String!) {
    insert_organizations_one(object: { name: $name, slug: $slug }) {
      id
      name
      slug
    }
  }
`;

export const ADD_ORG_MEMBER = `
  mutation AddOrgMember($orgId: uuid!, $userId: uuid!, $role: org_role!) {
    insert_org_members_one(
      object: { org_id: $orgId, user_id: $userId, role: $role }
    ) {
      id
    }
  }
`;

export const CREATE_WORKFLOW = `
  mutation CreateWorkflow($object: workflows_insert_input!) {
    insert_workflows_one(object: $object) {
      id
      name
    }
  }
`;

export const UPDATE_WORKFLOW = `
  mutation UpdateWorkflow($id: uuid!, $set: workflows_set_input!) {
    update_workflows_by_pk(pk_columns: { id: $id }, _set: $set) {
      id
      name
    }
  }
`;

export const DELETE_WORKFLOW_STEPS = `
  mutation DeleteWorkflowSteps($workflowId: uuid!) {
    delete_workflow_steps(where: { workflow_id: { _eq: $workflowId } }) {
      affected_rows
    }
  }
`;

export const INSERT_WORKFLOW_STEPS = `
  mutation InsertWorkflowSteps($objects: [workflow_steps_insert_input!]!) {
    insert_workflow_steps(objects: $objects) {
      affected_rows
      returning {
        id
        step_order
      }
    }
  }
`;

export const DELETE_WORKFLOW_TRIGGERS = `
  mutation DeleteWorkflowTriggers($workflowId: uuid!) {
    delete_workflow_triggers(where: { workflow_id: { _eq: $workflowId } }) {
      affected_rows
    }
  }
`;

export const INSERT_WORKFLOW_TRIGGERS = `
  mutation InsertWorkflowTriggers($objects: [workflow_triggers_insert_input!]!) {
    insert_workflow_triggers(objects: $objects) {
      affected_rows
      returning {
        id
        trigger_type
        webhook_token
      }
    }
  }
`;

export const TRIGGER_WORKFLOW_RUN = `
  mutation TriggerWorkflowRun($workflow_id: uuid!) {
    triggerWorkflowRun(workflow_id: $workflow_id) {
      workflow_run_id
      status
      message
    }
  }
`;

export const APPROVE_STEP = `
  mutation ApproveStep($step_run_id: uuid!) {
    approveStep(step_run_id: $step_run_id) {
      success
      message
      workflow_run_id
    }
  }
`;

// ---- Subscriptions ----

export const SUBSCRIBE_STEP_RUNS = `
  subscription WatchStepRuns($workflowRunId: uuid!) {
    step_runs(
      where: { workflow_run_id: { _eq: $workflowRunId } }
      order_by: { workflow_step: { step_order: asc } }
    ) {
      id
      status
      input
      output
      error
      attempt_count
      approved_by
      approved_at
      started_at
      completed_at
      workflow_step {
        id
        step_order
        step_type
        name
      }
    }
  }
`;

export const SUBSCRIBE_WORKFLOW_RUN = `
  subscription WatchWorkflowRun($runId: uuid!) {
    workflow_runs_by_pk(id: $runId) {
      id
      status
      started_at
      completed_at
      error_message
      step_runs(order_by: { workflow_step: { step_order: asc } }) {
        id
        status
        output
        error
        attempt_count
        approved_by
        approved_at
        started_at
        completed_at
        workflow_step {
          id
          step_order
          step_type
          name
        }
      }
    }
  }
`;
