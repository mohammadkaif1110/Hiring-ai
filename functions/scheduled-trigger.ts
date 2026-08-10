import type { Request, Response } from 'express';
import { adminQuery, gql } from './_lib/graphql-client';
import { checkOrgQuota } from './_lib/permissions';
import { createAndExecuteRun } from './_lib/workflow-engine';

/**
 * Scheduled Trigger Handler
 * 
 * Called by Hasura Cron Trigger on a schedule.
 * Queries all active scheduled triggers and fires their workflows.
 */
export default async function handler(req: Request, res: Response) {
  try {
    console.log('[Scheduled] Cron trigger fired at', new Date().toISOString());

    // Find all active scheduled triggers
    const data = await adminQuery<{
      workflow_triggers: Array<{
        id: string;
        workflow_id: string;
        config: Record<string, any>;
        workflow: {
          id: string;
          org_id: string;
          is_active: boolean;
          name: string;
        };
      }>;
    }>(
      gql`
        query GetScheduledTriggers {
          workflow_triggers(
            where: {
              trigger_type: { _eq: scheduled }
              is_active: { _eq: true }
              workflow: { is_active: { _eq: true } }
            }
          ) {
            id
            workflow_id
            config
            workflow {
              id
              org_id
              is_active
              name
            }
          }
        }
      `
    );

    const results: Array<{ workflow: string; status: string; runId?: string }> = [];

    for (const trigger of data.workflow_triggers) {
      try {
        // Check quota
        const quota = await checkOrgQuota(trigger.workflow.org_id);
        if (!quota.withinQuota) {
          results.push({
            workflow: trigger.workflow.name,
            status: 'skipped — quota exhausted',
          });
          continue;
        }

        // Execute
        const runId = await createAndExecuteRun(
          trigger.workflow.id,
          trigger.workflow.org_id,
          null,
          'scheduled'
        );

        results.push({
          workflow: trigger.workflow.name,
          status: 'triggered',
          runId,
        });
      } catch (error: any) {
        results.push({
          workflow: trigger.workflow.name,
          status: `error: ${error.message}`,
        });
      }
    }

    console.log('[Scheduled] Results:', JSON.stringify(results));
    return res.status(200).json({ triggered: results.length, results });
  } catch (error: any) {
    console.error('[Scheduled] Error:', error);
    return res.status(500).json({ message: error.message });
  }
}
