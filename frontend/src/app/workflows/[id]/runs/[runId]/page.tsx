"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ClientLayout from '@/components/ClientLayout';
import { useAuth } from '@/components/AuthProvider';
import Sidebar from '@/components/Sidebar';

interface StepRunData {
  id: string;
  status: string;
  input: any;
  output: any;
  error: string | null;
  attempt_count: number;
  approved_by: string | null;
  approved_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  workflow_step: {
    id: string;
    step_order: number;
    step_type: string;
    name: string;
  };
}

interface WorkflowRunData {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  step_runs: StepRunData[];
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'pending': return '○';
    case 'running': return '◉';
    case 'completed': return '✓';
    case 'failed': return '✕';
    case 'skipped': return '—';
    case 'awaiting_approval': return '✋';
    case 'paused': return '⏸';
    default: return '?';
  }
}

function RunViewerContent() {
  const { isAuthenticated, isLoading, currentRole, graphqlRequest } = useAuth();
  const router = useRouter();
  const params = useParams();
  const runId = params.runId as string;
  const workflowId = params.id as string;

  const [runData, setRunData] = useState<WorkflowRunData | null>(null);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchRunData = useCallback(async () => {
    try {
      const data = await graphqlRequest(
        `query GetWorkflowRun($runId: uuid!) {
          workflow_runs_by_pk(id: $runId) {
            id
            status
            started_at
            completed_at
            error_message
            step_runs(order_by: { workflow_step: { step_order: asc } }) {
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
        }`,
        { runId }
      );
      setRunData(data.workflow_runs_by_pk);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch run:', err);
      setLoading(false);
    }
  }, [runId, graphqlRequest]);

  // Poll for updates (simulates subscription for when WS isn't available)
  useEffect(() => {
    fetchRunData();
    pollRef.current = setInterval(fetchRunData, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchRunData]);

  // Stop polling when run is terminal
  useEffect(() => {
    if (runData && ['completed', 'failed', 'cancelled'].includes(runData.status)) {
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [runData?.status]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push('/auth/login');
  }, [isAuthenticated, isLoading, router]);

  const handleApprove = async (stepRunId: string) => {
    setApprovingId(stepRunId);
    setMessage('');
    try {
      const data = await graphqlRequest(
        `mutation ApproveStep($step_run_id: uuid!) {
          approveStep(step_run_id: $step_run_id) {
            success
            message
            workflow_run_id
          }
        }`,
        { step_run_id: stepRunId }
      );
      setMessage(`✅ ${data.approveStep.message}`);
      // Refresh immediately
      fetchRunData();
    } catch (err: any) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setApprovingId(null);
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

  if (!runData) {
    return (
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <div className="empty-state-title">Run not found</div>
          </div>
        </main>
      </div>
    );
  }

  const canApprove = currentRole === 'owner' || currentRole === 'editor';
  const duration = runData.completed_at
    ? Math.round((new Date(runData.completed_at).getTime() - new Date(runData.started_at).getTime()) / 1000)
    : Math.round((Date.now() - new Date(runData.started_at).getTime()) / 1000);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">
              Workflow Run
              <span className={`badge badge-${runData.status}`} style={{ marginLeft: 12, verticalAlign: 'middle', fontSize: 12 }}>
                {runData.status}
              </span>
            </h1>
            <p className="page-subtitle">
              Run ID: <span className="font-mono">{runData.id.substring(0, 8)}</span>
              {' · '}
              Duration: {duration}s
              {' · '}
              Started: {new Date(runData.started_at).toLocaleTimeString()}
            </p>
          </div>
          <button className="btn btn-ghost" onClick={() => router.push('/dashboard')}>
            ← Back
          </button>
        </div>

        {message && (
          <div className={message.startsWith('✅') ? 'success-message' : 'error-message'} style={{ marginBottom: 16 }}>
            {message}
          </div>
        )}

        {runData.error_message && (
          <div className="error-message mb-md">
            {runData.error_message}
          </div>
        )}

        {/* Live status indicator */}
        {['running', 'pending'].includes(runData.status) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', marginBottom: 20,
            background: 'rgba(59,130,246,0.08)', borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(59,130,246,0.2)',
            fontSize: 13, color: 'var(--status-running)'
          }}>
            <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
            Live — auto-refreshing every 2 seconds
          </div>
        )}

        {runData.status === 'paused' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', marginBottom: 20,
            background: 'rgba(245,158,11,0.08)', borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(245,158,11,0.2)',
            fontSize: 13, color: 'var(--status-paused)'
          }}>
            ⏸ Workflow paused — awaiting approval on a step below
          </div>
        )}

        {/* Step Timeline */}
        <div className="glass-card-static" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>
            Step Execution Timeline
          </h2>

          <div className="timeline">
            {runData.step_runs.map((stepRun) => (
              <div key={stepRun.id} className="timeline-item">
                <div className={`timeline-dot timeline-dot-${stepRun.status}`}>
                  {getStatusIcon(stepRun.status)}
                </div>
                <div className="timeline-content">
                  <div className="flex items-center gap-sm">
                    <span className="timeline-title">{stepRun.workflow_step.name}</span>
                    <span className={`step-badge step-badge-${stepRun.workflow_step.step_type}`}>
                      {stepRun.workflow_step.step_type.replace('_', ' ')}
                    </span>
                    <span className={`badge badge-${stepRun.status}`} style={{ fontSize: 10 }}>
                      {stepRun.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="timeline-meta">
                    Step {stepRun.workflow_step.step_order}
                    {stepRun.attempt_count > 0 && ` · Attempt ${stepRun.attempt_count}`}
                    {stepRun.started_at && ` · Started ${new Date(stepRun.started_at).toLocaleTimeString()}`}
                    {stepRun.completed_at && ` · Completed ${new Date(stepRun.completed_at).toLocaleTimeString()}`}
                  </div>

                  {/* Approval Gate UI */}
                  {stepRun.status === 'awaiting_approval' && canApprove && (
                    <div style={{
                      marginTop: 12, padding: 16,
                      background: 'rgba(245,158,11,0.05)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid rgba(245,158,11,0.2)',
                    }}>
                      <p style={{ fontSize: 13, marginBottom: 10, color: 'var(--status-paused)' }}>
                        ✋ This step requires approval to continue the workflow.
                      </p>
                      <button
                        className="btn btn-success btn-sm"
                        disabled={approvingId === stepRun.id}
                        onClick={() => handleApprove(stepRun.id)}
                      >
                        {approvingId === stepRun.id ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '✓'}
                        Approve & Continue
                      </button>
                    </div>
                  )}

                  {stepRun.status === 'awaiting_approval' && !canApprove && (
                    <div style={{
                      marginTop: 12, padding: 12,
                      background: 'var(--bg-primary)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px dashed var(--border-medium)',
                      fontSize: 12, color: 'var(--text-tertiary)',
                    }}>
                      🔒 Only owners and editors can approve this step.
                    </div>
                  )}

                  {stepRun.approved_by && (
                    <div className="timeline-meta" style={{ marginTop: 4, color: 'var(--status-completed)' }}>
                      ✓ Approved at {stepRun.approved_at ? new Date(stepRun.approved_at).toLocaleTimeString() : 'unknown time'}
                    </div>
                  )}

                  {/* Output display */}
                  {stepRun.output && Object.keys(stepRun.output).length > 0 && stepRun.status !== 'pending' && (
                    <div className="timeline-output">
                      {JSON.stringify(stepRun.output, null, 2)}
                    </div>
                  )}

                  {/* Error display */}
                  {stepRun.error && (
                    <div style={{
                      marginTop: 8, padding: 10,
                      background: 'rgba(239,68,68,0.08)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      fontFamily: 'var(--font-mono)', fontSize: 12,
                      color: '#fca5a5',
                    }}>
                      {stepRun.error}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function RunViewerPage() {
  return (
    <ClientLayout>
      <RunViewerContent />
    </ClientLayout>
  );
}
