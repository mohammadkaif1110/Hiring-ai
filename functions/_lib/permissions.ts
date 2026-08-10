import { adminQuery, gql } from './graphql-client';

export type OrgRole = 'owner' | 'editor' | 'viewer';

export interface OrgMembership {
  org_id: string;
  role: OrgRole;
}

/**
 * Get the user's role in a specific organization.
 * Returns null if the user is not a member.
 */
export async function getUserOrgRole(
  userId: string,
  orgId: string
): Promise<OrgRole | null> {
  const data = await adminQuery<{
    org_members: Array<{ role: OrgRole }>;
  }>(
    gql`
      query GetUserOrgRole($userId: uuid!, $orgId: uuid!) {
        org_members(
          where: { user_id: { _eq: $userId }, org_id: { _eq: $orgId } }
          limit: 1
        ) {
          role
        }
      }
    `,
    { userId, orgId }
  );

  return data.org_members[0]?.role ?? null;
}

/**
 * Check if a user can trigger a workflow run (must be owner or editor in the workflow's org).
 */
export async function canUserTriggerWorkflow(
  userId: string,
  workflowId: string
): Promise<{ allowed: boolean; orgId: string | null; role: OrgRole | null }> {
  const data = await adminQuery<{
    workflows: Array<{ org_id: string }>;
  }>(
    gql`
      query GetWorkflowOrg($workflowId: uuid!) {
        workflows(where: { id: { _eq: $workflowId } }, limit: 1) {
          org_id
        }
      }
    `,
    { workflowId }
  );

  const workflow = data.workflows[0];
  if (!workflow) {
    return { allowed: false, orgId: null, role: null };
  }

  const role = await getUserOrgRole(userId, workflow.org_id);
  const allowed = role === 'owner' || role === 'editor';

  return { allowed, orgId: workflow.org_id, role };
}

/**
 * Check if a user can approve a step (must be owner or editor in the run's org).
 * Layer 2 enforcement — this is a mid-execution decision.
 */
export async function canUserApproveStep(
  userId: string,
  stepRunId: string
): Promise<{
  allowed: boolean;
  orgId: string | null;
  role: OrgRole | null;
  workflowRunId: string | null;
  stepStatus: string | null;
}> {
  const data = await adminQuery<{
    step_runs: Array<{
      status: string;
      workflow_run: {
        id: string;
        org_id: string;
      };
    }>;
  }>(
    gql`
      query GetStepRunContext($stepRunId: uuid!) {
        step_runs(where: { id: { _eq: $stepRunId } }, limit: 1) {
          status
          workflow_run {
            id
            org_id
          }
        }
      }
    `,
    { stepRunId }
  );

  const stepRun = data.step_runs[0];
  if (!stepRun) {
    return { allowed: false, orgId: null, role: null, workflowRunId: null, stepStatus: null };
  }

  const role = await getUserOrgRole(userId, stepRun.workflow_run.org_id);
  const allowed = (role === 'owner' || role === 'editor') && stepRun.status === 'awaiting_approval';

  return {
    allowed,
    orgId: stepRun.workflow_run.org_id,
    role,
    workflowRunId: stepRun.workflow_run.id,
    stepStatus: stepRun.status,
  };
}

/**
 * Layer 2: Check if a user can add a step of the given type.
 * db_write and notify require owner role.
 */
export function canUserAddStepType(role: OrgRole, stepType: string): boolean {
  const ownerOnlyTypes = ['db_write', 'notify'];
  if (ownerOnlyTypes.includes(stepType)) {
    return role === 'owner';
  }
  return role === 'owner' || role === 'editor';
}

/**
 * Layer 2: Check if a user can add a webhook trigger.
 * Only owners can set up webhook triggers.
 */
export function canUserAddWebhookTrigger(role: OrgRole): boolean {
  return role === 'owner';
}

/**
 * Check if the org's quota is exhausted.
 */
export async function checkOrgQuota(orgId: string): Promise<{
  withinQuota: boolean;
  used: number;
  limit: number;
}> {
  const data = await adminQuery<{
    organizations_by_pk: { quota_used: number; quota_limit: number; quota_reset_at: string } | null;
  }>(
    gql`
      query CheckOrgQuota($orgId: uuid!) {
        organizations_by_pk(id: $orgId) {
          quota_used
          quota_limit
          quota_reset_at
        }
      }
    `,
    { orgId }
  );

  const org = data.organizations_by_pk;
  if (!org) {
    return { withinQuota: false, used: 0, limit: 0 };
  }

  // Check if quota needs reset (new month)
  const resetAt = new Date(org.quota_reset_at);
  if (resetAt <= new Date()) {
    // Reset quota
    await adminQuery(
      gql`
        mutation ResetQuota($orgId: uuid!, $newResetAt: timestamptz!) {
          update_organizations_by_pk(
            pk_columns: { id: $orgId }
            _set: { quota_used: 0, quota_reset_at: $newResetAt }
          ) {
            id
          }
        }
      `,
      {
        orgId,
        newResetAt: new Date(
          new Date().getFullYear(),
          new Date().getMonth() + 1,
          1
        ).toISOString(),
      }
    );
    return { withinQuota: true, used: 0, limit: org.quota_limit };
  }

  return {
    withinQuota: org.quota_used < org.quota_limit,
    used: org.quota_used,
    limit: org.quota_limit,
  };
}

/**
 * Increment the org's quota usage by 1.
 */
export async function incrementOrgQuota(orgId: string): Promise<void> {
  await adminQuery(
    gql`
      mutation IncrementQuota($orgId: uuid!) {
        update_organizations_by_pk(
          pk_columns: { id: $orgId }
          _inc: { quota_used: 1 }
        ) {
          id
          quota_used
        }
      }
    `,
    { orgId }
  );
}

/**
 * Extract the user ID from Hasura Action session variables.
 */
export function extractUserId(
  sessionVariables: Record<string, string>
): string | null {
  return (
    sessionVariables['x-hasura-user-id'] ||
    sessionVariables['X-Hasura-User-Id'] ||
    null
  );
}
