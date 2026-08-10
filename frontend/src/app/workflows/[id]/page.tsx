"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ClientLayout from '@/components/ClientLayout';
import { useAuth } from '@/components/AuthProvider';
import Sidebar from '@/components/Sidebar';

interface WorkflowDetail {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  org_id: string;
  workflow_steps: Array<{
    id: string;
    step_order: number;
    step_type: string;
    name: string;
    config: any;
  }>;
  workflow_triggers: Array<{
    id: string;
    trigger_type: string;
    config: any;
    is_active: boolean;
    webhook_token: string | null;
  }>;
}

interface RunSummary {
  id: string;
  status: string;
  trigger_type: string;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

function WorkflowDetailContent() {
  const { isAuthenticated, isLoading, currentRole, graphqlRequest } = useAuth();
  const router = useRouter();
  const params = useParams();
  const workflowId = params.id as string;

  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggeringRun, setTriggeringRun] = useState(false);
  const [message, setMessage] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [wfData, runData] = await Promise.all([
        graphqlRequest(
          `query GetWorkflow($id: uuid!) {
            workflows_by_pk(id: $id) {
              id name description is_active org_id
              workflow_steps(order_by: { step_order: asc }) {
                id step_order step_type name config
              }
              workflow_triggers {
                id trigger_type config is_active webhook_token
              }
            }
          }`,
          { id: workflowId }
        ),
        graphqlRequest(
          `query GetRuns($workflowId: uuid!) {
            workflow_runs(where: { workflow_id: { _eq: $workflowId } }, order_by: { started_at: desc }, limit: 10) {
              id status trigger_type started_at completed_at error_message
            }
          }`,
          { workflowId }
        ),
      ]);
      setWorkflow(wfData.workflows_by_pk);
      setRuns(runData.workflow_runs || []);
    } catch (err) {
      console.error('Failed to fetch workflow:', err);
    } finally {
      setLoading(false);
    }
  }, [workflowId, graphqlRequest]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push('/auth/login');
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTriggerRun = async () => {
    setTriggeringRun(true);
    setMessage('');
    try {
      const data = await graphqlRequest(
        `mutation TriggerWorkflowRun($workflow_id: uuid!) {
          triggerWorkflowRun(workflow_id: $workflow_id) {
            workflow_run_id status message
          }
        }`,
        { workflow_id: workflowId }
      );
      const result = data.triggerWorkflowRun;
      setMessage(`✅ ${result.message}`);
      router.push(`/workflows/${workflowId}/runs/${result.workflow_run_id}`);
    } catch (err: any) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setTriggeringRun(false);
    }
  };

  if (isLoading || loading) {
    return (
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <div className="spinner spinner-lg" />
          </div>
        </main>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <div className="empty-state-title">Workflow not found</div>
            <p className="text-muted">This workflow may belong to another organization.</p>
          </div>
        </main>
      </div>
    );
  }

  const canTrigger = currentRole === 'owner' || currentRole === 'editor';

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">{workflow.name}</h1>
            <p className="page-subtitle">{workflow.description || 'No description'}</p>
          </div>
          <div className="flex gap-sm">
            <button className="btn btn-ghost" onClick={() => router.push('/dashboard')}>← Back</button>
            {canTrigger && (
              <button className="btn btn-primary" onClick={handleTriggerRun} disabled={triggeringRun}>
                {triggeringRun ? <span className="spinner" /> : '▶'} Run Workflow
              </button>
            )}
          </div>
        </div>

        {message && (
          <div className={message.startsWith('✅') ? 'success-message' : 'error-message'} style={{ marginBottom: 16 }}>
            {message}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Steps */}
          <div className="glass-card-static" style={{ padding: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
              Steps ({workflow.workflow_steps.length})
            </h2>
            <div className="flex-col">
              {workflow.workflow_steps.map((step, i) => (
                <React.Fragment key={step.id}>
                  {i > 0 && <div className="step-connector" />}
                  <div className="step-card" style={{ cursor: 'default' }}>
                    <div className="step-number">{step.step_order}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{step.name}</div>
                      <span className={`step-badge step-badge-${step.step_type}`}>
                        {step.step_type.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Triggers & Runs */}
          <div className="flex-col gap-lg">
            <div className="glass-card-static" style={{ padding: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Triggers</h2>
              <div className="flex-col gap-sm">
                {workflow.workflow_triggers.map((trigger) => (
                  <div key={trigger.id} className="step-card" style={{ cursor: 'default' }}>
                    <span className={`trigger-badge trigger-badge-${trigger.trigger_type}`}>
                      {trigger.trigger_type.replace('_', ' ')}
                    </span>
                    {trigger.webhook_token && (
                      <div style={{ flex: 1 }}>
                        <div className="text-xs text-muted">Webhook Token:</div>
                        <div className="font-mono text-xs">{trigger.webhook_token}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card-static" style={{ padding: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
                Recent Runs ({runs.length})
              </h2>
              {runs.length === 0 ? (
                <p className="text-muted text-sm">No runs yet.</p>
              ) : (
                <div className="flex-col gap-sm">
                  {runs.map((run) => (
                    <div
                      key={run.id}
                      className="step-card"
                      style={{ cursor: 'pointer' }}
                      onClick={() => router.push(`/workflows/${workflowId}/runs/${run.id}`)}
                    >
                      <span className={`badge badge-${run.status}`}>{run.status}</span>
                      <span className={`trigger-badge trigger-badge-${run.trigger_type}`} style={{ fontSize: 10 }}>
                        {run.trigger_type}
                      </span>
                      <span className="text-xs text-muted" style={{ flex: 1, textAlign: 'right' }}>
                        {new Date(run.started_at).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function WorkflowDetailPage() {
  return (
    <ClientLayout>
      <WorkflowDetailContent />
    </ClientLayout>
  );
}
