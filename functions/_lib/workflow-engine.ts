import { adminQuery, gql } from './graphql-client';
import {
  executeLlmCall,
  executeHttpRequest,
  executeDbWrite,
  executeNotify,
  evaluateConditionalBranch,
} from './step-executors';
import { incrementOrgQuota } from './permissions';

const MAX_RETRIES = 1; // 1 retry = 2 total attempts for llm_call and http_request

interface StepDef {
  id: string;
  step_order: number;
  step_type: string;
  name: string;
  config: Record<string, any>;
}

interface StepRunRecord {
  id: string;
  workflow_step_id: string;
  status: string;
}

// ---- Update helpers ----

async function updateStepRunStatus(
  stepRunId: string,
  status: string,
  extras?: Record<string, any>
): Promise<void> {
  const setFields: Record<string, any> = { status };
  if (status === 'running') setFields.started_at = new Date().toISOString();
  if (['completed', 'failed', 'skipped'].includes(status))
    setFields.completed_at = new Date().toISOString();
  if (extras) Object.assign(setFields, extras);

  await adminQuery(
    gql`
      mutation UpdateStepRun($id: uuid!, $set: step_runs_set_input!) {
        update_step_runs_by_pk(pk_columns: { id: $id }, _set: $set) {
          id
        }
      }
    `,
    { id: stepRunId, set: setFields }
  );
}

async function updateWorkflowRunStatus(
  runId: string,
  status: string,
  extras?: Record<string, any>
): Promise<void> {
  const setFields: Record<string, any> = { status };
  if (status === 'completed' || status === 'failed')
    setFields.completed_at = new Date().toISOString();
  if (extras) Object.assign(setFields, extras);

  await adminQuery(
    gql`
      mutation UpdateWorkflowRun($id: uuid!, $set: workflow_runs_set_input!) {
        update_workflow_runs_by_pk(pk_columns: { id: $id }, _set: $set) {
          id
        }
      }
    `,
    { id: runId, set: setFields }
  );
}

// ---- Create step_run records ----

async function createStepRuns(
  workflowRunId: string,
  steps: StepDef[]
): Promise<StepRunRecord[]> {
  const objects = steps.map((step) => ({
    workflow_run_id: workflowRunId,
    workflow_step_id: step.id,
    status: 'pending',
    input: {},
    output: {},
  }));

  const data = await adminQuery<{
    insert_step_runs: { returning: StepRunRecord[] };
  }>(
    gql`
      mutation CreateStepRuns($objects: [step_runs_insert_input!]!) {
        insert_step_runs(objects: $objects) {
          returning {
            id
            workflow_step_id
            status
          }
        }
      }
    `,
    { objects }
  );

  return data.insert_step_runs.returning;
}

// ---- Execute a single step with retry ----

async function executeStepWithRetry(
  stepDef: StepDef,
  stepRunId: string,
  previousOutput: Record<string, any>
): Promise<{ output: Record<string, any>; action?: string }> {
  const retryableTypes = ['llm_call', 'http_request'];
  const maxAttempts = retryableTypes.includes(stepDef.step_type)
    ? MAX_RETRIES + 1
    : 1;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Update attempt count
      await adminQuery(
        gql`
          mutation IncrementAttempt($id: uuid!) {
            update_step_runs_by_pk(
              pk_columns: { id: $id }
              _inc: { attempt_count: 1 }
            ) {
              id
            }
          }
        `,
        { id: stepRunId }
      );

      let output: Record<string, any> = {};
      let action: string | undefined;

      switch (stepDef.step_type) {
        case 'llm_call':
          output = await executeLlmCall(stepDef.config as any, previousOutput);
          break;

        case 'http_request':
          output = await executeHttpRequest(stepDef.config as any, previousOutput);
          break;

        case 'db_write':
          output = await executeDbWrite(stepDef.config as any, previousOutput);
          break;

        case 'notify':
          output = await executeNotify(stepDef.config as any, previousOutput);
          break;

        case 'conditional_branch':
          const branchResult = evaluateConditionalBranch(
            stepDef.config as any,
            previousOutput
          );
          output = branchResult;
          action = branchResult.action;
          break;

        case 'approval_gate':
          // Don't execute — pause the run
          return { output: { awaiting_approval: true }, action: 'pause' };

        default:
          throw new Error(`Unknown step type: ${stepDef.step_type}`);
      }

      return { output, action };
    } catch (error: any) {
      lastError = error;
      console.error(
        `[Step ${stepDef.name}] Attempt ${attempt}/${maxAttempts} failed:`,
        error.message
      );

      if (attempt < maxAttempts) {
        // Wait before retry (exponential backoff)
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * Math.pow(2, attempt - 1))
        );
      }
    }
  }

  throw lastError || new Error('Step execution failed');
}

// ---- Main workflow execution ----

export async function executeWorkflow(
  workflowRunId: string,
  startFromOrder?: number
): Promise<void> {
  // Fetch the workflow run details
  const runData = await adminQuery<{
    workflow_runs_by_pk: {
      id: string;
      workflow_id: string;
      org_id: string;
      workflow: {
        workflow_steps: StepDef[];
      };
    } | null;
  }>(
    gql`
      query GetWorkflowRunDetails($runId: uuid!) {
        workflow_runs_by_pk(id: $runId) {
          id
          workflow_id
          org_id
          workflow {
            workflow_steps(order_by: { step_order: asc }) {
              id
              step_order
              step_type
              name
              config
            }
          }
        }
      }
    `,
    { runId: workflowRunId }
  );

  const run = runData.workflow_runs_by_pk;
  if (!run) throw new Error('Workflow run not found');

  const steps = run.workflow.workflow_steps;
  if (steps.length === 0) {
    await updateWorkflowRunStatus(workflowRunId, 'completed');
    return;
  }

  // Set run to running
  await updateWorkflowRunStatus(workflowRunId, 'running');

  // Create step_run records if this is a fresh start (not resuming)
  let stepRuns: StepRunRecord[];
  if (!startFromOrder) {
    stepRuns = await createStepRuns(workflowRunId, steps);
  } else {
    // Fetch existing step runs
    const existingData = await adminQuery<{
      step_runs: StepRunRecord[];
    }>(
      gql`
        query GetExistingStepRuns($runId: uuid!) {
          step_runs(where: { workflow_run_id: { _eq: $runId } }) {
            id
            workflow_step_id
            status
          }
        }
      `,
      { runId: workflowRunId }
    );
    stepRuns = existingData.step_runs;
  }

  // Build a map from step ID to step run ID
  const stepRunMap: Record<string, string> = {};
  for (const sr of stepRuns) {
    stepRunMap[sr.workflow_step_id] = sr.id;
  }

  // Execute steps sequentially
  let previousOutput: Record<string, any> = {};
  let skipNext = false;

  for (const step of steps) {
    // If resuming, skip steps before the start order
    if (startFromOrder && step.step_order < startFromOrder) {
      // Load the previous output from the already-completed step
      const prevData = await adminQuery<{
        step_runs: Array<{ output: Record<string, any> }>;
      }>(
        gql`
          query GetStepOutput($runId: uuid!, $stepId: uuid!) {
            step_runs(
              where: {
                workflow_run_id: { _eq: $runId }
                workflow_step_id: { _eq: $stepId }
              }
            ) {
              output
            }
          }
        `,
        { runId: workflowRunId, stepId: step.id }
      );
      previousOutput = prevData.step_runs[0]?.output || previousOutput;
      continue;
    }

    const stepRunId = stepRunMap[step.id];
    if (!stepRunId) continue;

    // Check if we should skip this step
    if (skipNext) {
      await updateStepRunStatus(stepRunId, 'skipped', { output: { skipped: true, reason: 'conditional_branch' } });
      skipNext = false;
      continue;
    }

    // Mark as running
    await updateStepRunStatus(stepRunId, 'running', { input: previousOutput });

    try {
      const { output, action } = await executeStepWithRetry(
        step,
        stepRunId,
        previousOutput
      );

      // Handle special actions
      if (action === 'pause') {
        // Approval gate — pause the run
        await updateStepRunStatus(stepRunId, 'awaiting_approval', {
          output: { awaiting_approval: true, step_name: step.name },
        });
        await updateWorkflowRunStatus(workflowRunId, 'paused');
        console.log(
          `[Workflow] Run ${workflowRunId} paused at approval gate: ${step.name}`
        );
        return; // Stop execution — will be resumed by approveStep
      }

      if (action === 'skip_next') {
        skipNext = true;
      }

      // Mark step as completed
      await updateStepRunStatus(stepRunId, 'completed', { output });
      previousOutput = output;
    } catch (error: any) {
      // Step failed after all retries
      await updateStepRunStatus(stepRunId, 'failed', {
        error: error.message,
        output: { error: error.message },
      });
      await updateWorkflowRunStatus(workflowRunId, 'failed', {
        error_message: `Step "${step.name}" failed: ${error.message}`,
      });
      console.error(
        `[Workflow] Run ${workflowRunId} failed at step "${step.name}":`,
        error.message
      );
      return;
    }
  }

  // All steps completed successfully
  await updateWorkflowRunStatus(workflowRunId, 'completed');
  await incrementOrgQuota(run.org_id);
  console.log(`[Workflow] Run ${workflowRunId} completed successfully`);
}

/**
 * Create a workflow run and start execution.
 */
export async function createAndExecuteRun(
  workflowId: string,
  orgId: string,
  triggeredBy: string | null,
  triggerType: string
): Promise<string> {
  // Create the workflow_run
  const data = await adminQuery<{
    insert_workflow_runs_one: { id: string };
  }>(
    gql`
      mutation CreateWorkflowRun(
        $workflowId: uuid!
        $orgId: uuid!
        $triggeredBy: uuid
        $triggerType: trigger_type!
      ) {
        insert_workflow_runs_one(
          object: {
            workflow_id: $workflowId
            org_id: $orgId
            triggered_by: $triggeredBy
            trigger_type: $triggerType
            status: pending
          }
        ) {
          id
        }
      }
    `,
    { workflowId, orgId, triggeredBy, triggerType }
  );

  const runId = data.insert_workflow_runs_one.id;

  // Execute asynchronously — don't await, let it run in background
  executeWorkflow(runId).catch((err) => {
    console.error(`[Workflow] Background execution error for run ${runId}:`, err);
    updateWorkflowRunStatus(runId, 'failed', {
      error_message: err.message,
    }).catch(console.error);
  });

  return runId;
}
