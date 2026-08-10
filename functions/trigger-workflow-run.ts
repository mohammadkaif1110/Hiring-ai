import type { Request, Response } from 'express';
import {
  extractUserId,
  canUserTriggerWorkflow,
  checkOrgQuota,
} from './_lib/permissions';
import { createAndExecuteRun } from './_lib/workflow-engine';

/**
 * Hasura Action: triggerWorkflowRun
 * 
 * Called when a user manually triggers a workflow run.
 * Enforces:
 *   - Layer 1: User must be owner/editor in the workflow's org
 *   - Quota check: Org must have remaining quota
 */
export default async function handler(req: Request, res: Response) {
  try {
    const { input, session_variables } = req.body;
    const workflowId = input?.workflow_id;

    if (!workflowId) {
      return res.status(400).json({
        message: 'workflow_id is required',
      });
    }

    // Extract user ID from session
    const userId = extractUserId(session_variables || {});
    if (!userId) {
      return res.status(401).json({
        message: 'Authentication required',
      });
    }

    // Layer 1: Check org membership + role
    const { allowed, orgId, role } = await canUserTriggerWorkflow(
      userId,
      workflowId
    );
    if (!allowed) {
      return res.status(403).json({
        message:
          role === 'viewer'
            ? 'Viewers cannot trigger workflow runs'
            : 'You are not authorized to trigger this workflow',
      });
    }

    // Quota check
    const quota = await checkOrgQuota(orgId!);
    if (!quota.withinQuota) {
      return res.status(429).json({
        message: `Organization quota exhausted (${quota.used}/${quota.limit}). Please upgrade or wait for quota reset.`,
      });
    }

    // Create and execute the run
    const runId = await createAndExecuteRun(
      workflowId,
      orgId!,
      userId,
      'manual'
    );

    return res.status(200).json({
      workflow_run_id: runId,
      status: 'started',
      message: `Workflow run started successfully. Quota: ${quota.used + 1}/${quota.limit}`,
    });
  } catch (error: any) {
    console.error('[triggerWorkflowRun] Error:', error);
    return res.status(500).json({
      message: `Internal error: ${error.message}`,
    });
  }
}
