"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ClientLayout from '@/components/ClientLayout';
import { useAuth } from '@/components/AuthProvider';
import Sidebar from '@/components/Sidebar';

interface Workflow {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
  workflow_steps: Array<{ id: string; step_type: string; name: string }>;
  workflow_triggers: Array<{ id: string; trigger_type: string; is_active: boolean }>;
  workflow_runs: Array<{ id: string; status: string; started_at: string }>;
}

function DashboardContent() {
  const { isAuthenticated, isLoading, currentOrg, currentRole, graphqlRequest } = useAuth();
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const fetchWorkflows = useCallback(async () => {
    if (!currentOrg) return;
    try {
      const data = await graphqlRequest(
        `query GetOrgWorkflows($orgId: uuid!) {
          workflows(where: { org_id: { _eq: $orgId } }, order_by: { created_at: desc }) {
            id
            name
            description
            is_active
            created_at
            workflow_steps(order_by: { step_order: asc }) {
              id
              step_type
              name
            }
            workflow_triggers {
              id
              trigger_type
              is_active
            }
            workflow_runs(limit: 1, order_by: { started_at: desc }) {
              id
              status
              started_at
            }
          }
        }`,
        { orgId: currentOrg.organization.id }
      );
      setWorkflows(data.workflows || []);
    } catch (err) {
      console.error('Failed to fetch workflows:', err);
    } finally {
      setLoading(false);
    }
  }, [currentOrg, graphqlRequest]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/auth/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (currentOrg) {
      setLoading(true);
      fetchWorkflows();
    }
  }, [currentOrg, fetchWorkflows]);

  const handleTriggerRun = async (workflowId: string) => {
    setTriggeringId(workflowId);
    setMessage('');
    try {
      const data = await graphqlRequest(
        `mutation TriggerWorkflowRun($workflow_id: uuid!) {
          triggerWorkflowRun(workflow_id: $workflow_id) {
            workflow_run_id
            status
            message
          }
        }`,
        { workflow_id: workflowId }
      );
      const result = data.triggerWorkflowRun;
      setMessage(`✅ ${result.message}`);
      // Navigate to run detail
      router.push(`/workflows/${workflowId}/runs/${result.workflow_run_id}`);
    } catch (err: any) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setTriggeringId(null);
    }
  };

  if (isLoading) {
    return <div className="auth-container"><div className="spinner spinner-lg" /></div>;
  }

  if (!isAuthenticated) return null;

  const canTrigger = currentRole === 'owner' || currentRole === 'editor';

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Workflows</h1>
            <p className="page-subtitle">
              {currentOrg ? `${currentOrg.organization.name} — ${workflows.length} workflows` : 'Select an organization'}
            </p>
          </div>
          {canTrigger && (
            <button className="btn btn-primary" onClick={() => router.push('/workflows/new')}>
              <span>+</span> New Workflow
            </button>
          )}
        </div>

        {message && (
          <div className={message.startsWith('✅') ? 'success-message' : 'error-message'} style={{ marginBottom: 16 }}>
            {message}
          </div>
        )}

        {!currentOrg ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏢</div>
            <div className="empty-state-title">No organization selected</div>
            <p>Create or join an organization to get started</p>
          </div>
        ) : loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <div className="spinner spinner-lg" />
          </div>
        ) : workflows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">⚡</div>
            <div className="empty-state-title">No workflows yet</div>
            <p>Create your first AI agent workflow</p>
            {canTrigger && (
              <button className="btn btn-primary mt-md" onClick={() => router.push('/workflows/new')}>
                Create Workflow
              </button>
            )}
          </div>
        ) : (
          <div className="grid-2">
            {workflows.map((wf) => {
              const lastRun = wf.workflow_runs[0];
              return (
                <div key={wf.id} className="glass-card" style={{ padding: 20, cursor: 'pointer' }}>
                  <div className="flex items-center justify-between mb-sm">
                    <h3 style={{ fontSize: 16, fontWeight: 600 }}>{wf.name}</h3>
                    {lastRun && (
                      <span className={`badge badge-${lastRun.status}`}>{lastRun.status}</span>
                    )}
                  </div>

                  <p className="text-sm text-muted mb-md" style={{ minHeight: 20 }}>
                    {wf.description || 'No description'}
                  </p>

                  <div className="flex gap-sm mb-md" style={{ flexWrap: 'wrap' }}>
                    {wf.workflow_steps.map((step) => (
                      <span key={step.id} className={`step-badge step-badge-${step.step_type}`}>
                        {step.step_type.replace('_', ' ')}
                      </span>
                    ))}
                  </div>

                  <div className="flex gap-sm mb-md" style={{ flexWrap: 'wrap' }}>
                    {wf.workflow_triggers.map((trigger) => (
                      <span key={trigger.id} className={`trigger-badge trigger-badge-${trigger.trigger_type}`}>
                        {trigger.trigger_type.replace('_', ' ')}
                      </span>
                    ))}
                  </div>

                  <div className="flex gap-sm">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={(e) => { e.stopPropagation(); router.push(`/workflows/${wf.id}`); }}
                    >
                      Edit
                    </button>
                    {canTrigger && (
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={triggeringId === wf.id}
                        onClick={(e) => { e.stopPropagation(); handleTriggerRun(wf.id); }}
                      >
                        {triggeringId === wf.id ? <span className="spinner" /> : '▶'} Run
                      </button>
                    )}
                    {lastRun && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={(e) => { e.stopPropagation(); router.push(`/workflows/${wf.id}/runs/${lastRun.id}`); }}
                      >
                        View Run
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ClientLayout>
      <DashboardContent />
    </ClientLayout>
  );
}
