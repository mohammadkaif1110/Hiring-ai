import type { Request, Response } from 'express';
import { adminQuery, gql } from './_lib/graphql-client';
import { checkOrgQuota } from './_lib/permissions';
import { createAndExecuteRun } from './_lib/workflow-engine';

/**
 * Hasura Action: webhookTrigger
 * 
 * Inbound webhook endpoint that external systems call to start a workflow run.
 * Uses a webhook_token to identify which workflow to trigger.
 * No user auth required — the token itself is the authorization.
 */
export default async function handler(req: Request, res: Response) {
  try {
    const { input } = req.body;
    const webhookToken = input?.webhook_token;
    const payload = input?.payload || {};

    if (!webhookToken) {
      return res.status(400).json({
        message: 'webhook_token is required',
      });
    }

    // Look up the workflow trigger by token
    const data = await adminQuery<{
      workflow_triggers: Array<{
        id: string;
        workflow_id: string;
        is_active: boolean;
        workflow: {
          id: string;
          org_id: string;
          is_active: boolean;
        };
      }>;
    }>(
      gql`
        query FindWebhookTrigger($token: String!) {
          workflow_triggers(
            where: {
              webhook_token: { _eq: $token }
              trigger_type: { _eq: webhook }
              is_active: { _eq: true }
            }
            limit: 1
          ) {
            id
            workflow_id
            is_active
            workflow {
              id
              org_id
              is_active
            }
          }
        }
      `,
      { token: webhookToken }
    );

    const trigger = data.workflow_triggers[0];
    if (!trigger) {
      return res.status(404).json({
        message: 'Invalid or inactive webhook token',
      });
    }

    if (!trigger.workflow.is_active) {
      return res.status(400).json({
        message: 'Workflow is inactive',
      });
    }

    // Check quota
    const quota = await checkOrgQuota(trigger.workflow.org_id);
    if (!quota.withinQuota) {
      return res.status(429).json({
        message: 'Organization quota exhausted',
      });
    }

    // Create and execute the run
    const runId = await createAndExecuteRun(
      trigger.workflow.id,
      trigger.workflow.org_id,
      null, // webhook triggers don't have a user
      'webhook'
    );

    return res.status(200).json({
      workflow_run_id: runId,
      status: 'started',
      message: 'Workflow triggered via webhook',
    });
  } catch (error: any) {
    console.error('[webhookTrigger] Error:', error);
    return res.status(500).json({
      message: `Internal error: ${error.message}`,
    });
  }
}
