import type { Request, Response } from 'express';
import { extractUserId, canUserApproveStep } from './_lib/permissions';
import { executeWorkflow } from './_lib/workflow-engine';
import { adminQuery, gql } from './_lib/graphql-client';

/**
 * Hasura Action: approveStep
 * 
 * Called when a user approves a paused approval_gate step.
 * Enforces:
 *   - Layer 2: User must be owner/editor in the run's org (mid-execution decision)
 *   - Step must be in 'awaiting_approval' status
 */
export default async function handler(req: Request, res: Response) {
  try {
    const { input, session_variables } = req.body;
    const stepRunId = input?.step_run_id;

    if (!stepRunId) {
      return res.status(400).json({
        message: 'step_run_id is required',
      });
    }

    // Extract user ID from session
    const userId = extractUserId(session_variables || {});
    if (!userId) {
      return res.status(401).json({
        message: 'Authentication required',
      });
    }

    // Layer 2: Check approval authorization
    const { allowed, orgId, role, workflowRunId, stepStatus } =
      await canUserApproveStep(userId, stepRunId);

    if (stepStatus !== 'awaiting_approval') {
      return res.status(400).json({
        message: `Step is not awaiting approval (current status: ${stepStatus})`,
      });
    }

    if (!allowed) {
      return res.status(403).json({
        message:
          role === 'viewer'
            ? 'Viewers cannot approve workflow steps'
            : 'You are not authorized to approve this step',
      });
    }

    // Approve the step
    await adminQuery(
      gql`
        mutation ApproveStepRun($id: uuid!, $approvedBy: uuid!, $now: timestamptz!, $output: jsonb!) {
          update_step_runs_by_pk(
            pk_columns: { id: $id }
            _set: {
              status: completed
              approved_by: $approvedBy
              approved_at: $now
              completed_at: $now
              output: $output
            }
          ) {
            id
            workflow_step {
              step_order
            }
          }
        }
      `,
      {
        id: stepRunId,
        approvedBy: userId,
        now: new Date().toISOString(),
        output: { approved: true, approved_by_role: role },
      }
    );

    // Get the step order to know where to resume
    const stepData = await adminQuery<{
      step_runs_by_pk: {
        workflow_step: { step_order: number };
      } | null;
    }>(
      gql`
        query GetStepOrder($id: uuid!) {
          step_runs_by_pk(id: $id) {
            workflow_step {
              step_order
            }
          }
        }
      `,
      { id: stepRunId }
    );

    const resumeFromOrder =
      (stepData.step_runs_by_pk?.workflow_step.step_order ?? 0) + 1;

    // Resume workflow execution from the next step (asynchronous)
    executeWorkflow(workflowRunId!, resumeFromOrder).catch((err) => {
      console.error(
        `[approveStep] Error resuming workflow ${workflowRunId}:`,
        err
      );
    });

    return res.status(200).json({
      success: true,
      message: 'Step approved. Workflow execution resumed.',
      workflow_run_id: workflowRunId,
    });
  } catch (error: any) {
    console.error('[approveStep] Error:', error);
    return res.status(500).json({
      message: `Internal error: ${error.message}`,
    });
  }
}
