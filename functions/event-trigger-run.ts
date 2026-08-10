import type { Request, Response } from 'express';
import { adminQuery, gql } from './_lib/graphql-client';
import { checkOrgQuota } from './_lib/permissions';
import { createAndExecuteRun } from './_lib/workflow-engine';

/**
 * Database Event Trigger Handler
 * 
 * Called by a Hasura Event Trigger when a row changes in a watched table.
 * Looks up which workflow is associated with that table and fires it.
 */
export default async function handler(req: Request, res: Response) {
  try {
    const { event, table } = req.body;
    const tableName = `${table.schema}.${table.name}`;

    console.log(
      `[DBEvent] Event on ${tableName}:`,
      event.op,
      'data:',
      JSON.stringify(event.data?.new || {}).substring(0, 200)
    );

    // Find workflows watching this table
    const data = await adminQuery<{
      watched_tables: Array<{
        id: string;
        workflow_id: string;
        org_id: string;
        workflow: {
          id: string;
          is_active: boolean;
          name: string;
        };
      }>;
    }>(
      gql`
        query FindWatchedWorkflows($tableName: String!) {
          watched_tables(
            where: {
              table_name: { _eq: $tableName }
              is_active: { _eq: true }
              workflow: { is_active: { _eq: true } }
            }
          ) {
            id
            workflow_id
            org_id
            workflow {
              id
              is_active
              name
            }
          }
        }
      `,
      { tableName }
    );

    for (const wt of data.watched_tables) {
      const quota = await checkOrgQuota(wt.org_id);
      if (!quota.withinQuota) {
        console.log(
          `[DBEvent] Skipping ${wt.workflow.name} — quota exhausted`
        );
        continue;
      }

      const runId = await createAndExecuteRun(
        wt.workflow.id,
        wt.org_id,
        null,
        'database_event'
      );

      console.log(
        `[DBEvent] Triggered workflow "${wt.workflow.name}" → run ${runId}`
      );
    }

    return res.status(200).json({ message: 'Event processed' });
  } catch (error: any) {
    console.error('[DBEvent] Error:', error);
    return res.status(500).json({ message: error.message });
  }
}
