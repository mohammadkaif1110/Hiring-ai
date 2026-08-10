"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ClientLayout from '@/components/ClientLayout';
import { useAuth } from '@/components/AuthProvider';
import Sidebar from '@/components/Sidebar';
import { v4 as uuidv4 } from 'uuid';

const STEP_TYPES = [
  { value: 'llm_call', label: 'LLM Call', icon: '🤖', description: 'Call an LLM API (Groq)', ownerOnly: false },
  { value: 'http_request', label: 'HTTP Request', icon: '🌐', description: 'Call an external API', ownerOnly: false },
  { value: 'db_write', label: 'DB Write', icon: '💾', description: 'Write data to database', ownerOnly: true },
  { value: 'notify', label: 'Notify', icon: '🔔', description: 'Send a notification', ownerOnly: true },
  { value: 'conditional_branch', label: 'Conditional Branch', icon: '🔀', description: 'If/else based on output', ownerOnly: false },
  { value: 'approval_gate', label: 'Approval Gate', icon: '✋', description: 'Pause for human approval', ownerOnly: false },
];

const TRIGGER_TYPES = [
  { value: 'manual', label: 'Manual', icon: '👆', description: 'Click to run' },
  { value: 'webhook', label: 'Webhook', icon: '🔗', description: 'HTTP endpoint trigger' },
  { value: 'scheduled', label: 'Scheduled', icon: '⏰', description: 'Cron-based schedule' },
  { value: 'database_event', label: 'Database Event', icon: '🗄️', description: 'Row change trigger' },
];

interface Step {
  id: string;
  step_type: string;
  name: string;
  config: Record<string, any>;
}

interface Trigger {
  id: string;
  trigger_type: string;
  config: Record<string, any>;
  webhook_token?: string;
}

function StepConfigForm({ step, onChange }: { step: Step; onChange: (config: Record<string, any>) => void }) {
  const config = step.config;

  switch (step.step_type) {
    case 'llm_call':
      return (
        <div className="flex-col gap-sm">
          <div>
            <label className="input-label">System Prompt</label>
            <textarea
              className="input-field"
              placeholder="You are a helpful assistant..."
              value={config.system_prompt || ''}
              onChange={(e) => onChange({ ...config, system_prompt: e.target.value })}
            />
          </div>
          <div>
            <label className="input-label">Prompt Template</label>
            <textarea
              className="input-field"
              placeholder="Analyze: {{input.text}} — use {{previous.field}} for previous step output"
              value={config.prompt || ''}
              onChange={(e) => onChange({ ...config, prompt: e.target.value })}
            />
          </div>
          <div>
            <label className="input-label">Model</label>
            <input
              className="input-field"
              placeholder="llama-3.3-70b-versatile"
              value={config.model || ''}
              onChange={(e) => onChange({ ...config, model: e.target.value })}
            />
          </div>
          <div className="grid-2">
            <div>
              <label className="input-label">Max Tokens</label>
              <input
                className="input-field"
                type="number"
                placeholder="1024"
                value={config.max_tokens || ''}
                onChange={(e) => onChange({ ...config, max_tokens: parseInt(e.target.value) || 1024 })}
              />
            </div>
            <div>
              <label className="input-label">Temperature</label>
              <input
                className="input-field"
                type="number"
                step="0.1"
                placeholder="0.7"
                value={config.temperature ?? ''}
                onChange={(e) => onChange({ ...config, temperature: parseFloat(e.target.value) || 0.7 })}
              />
            </div>
          </div>
        </div>
      );

    case 'http_request':
      return (
        <div className="flex-col gap-sm">
          <div className="grid-2">
            <div>
              <label className="input-label">Method</label>
              <select
                className="input-field"
                value={config.method || 'GET'}
                onChange={(e) => onChange({ ...config, method: e.target.value })}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
            <div>
              <label className="input-label">URL</label>
              <input
                className="input-field"
                placeholder="https://httpbin.org/post"
                value={config.url || ''}
                onChange={(e) => onChange({ ...config, url: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="input-label">Body Template (JSON)</label>
            <textarea
              className="input-field"
              placeholder='{"result": "{{previous.response}}"}'
              value={config.body_template || ''}
              onChange={(e) => onChange({ ...config, body_template: e.target.value })}
            />
          </div>
        </div>
      );

    case 'conditional_branch':
      return (
        <div className="flex-col gap-sm">
          <div>
            <label className="input-label">Condition Field (path in previous output)</label>
            <input
              className="input-field"
              placeholder="response"
              value={config.condition_field || ''}
              onChange={(e) => onChange({ ...config, condition_field: e.target.value })}
            />
          </div>
          <div className="grid-2">
            <div>
              <label className="input-label">Operator</label>
              <select
                className="input-field"
                value={config.operator || 'contains'}
                onChange={(e) => onChange({ ...config, operator: e.target.value })}
              >
                <option value="equals">Equals</option>
                <option value="not_equals">Not Equals</option>
                <option value="contains">Contains</option>
                <option value="not_contains">Not Contains</option>
                <option value="greater_than">Greater Than</option>
                <option value="less_than">Less Than</option>
                <option value="exists">Exists</option>
                <option value="is_empty">Is Empty</option>
              </select>
            </div>
            <div>
              <label className="input-label">Value</label>
              <input
                className="input-field"
                placeholder="positive"
                value={config.value || ''}
                onChange={(e) => onChange({ ...config, value: e.target.value })}
              />
            </div>
          </div>
          <div className="grid-2">
            <div>
              <label className="input-label">If True</label>
              <select
                className="input-field"
                value={config.on_true_action || 'continue'}
                onChange={(e) => onChange({ ...config, on_true_action: e.target.value })}
              >
                <option value="continue">Continue</option>
                <option value="skip_next">Skip Next Step</option>
              </select>
            </div>
            <div>
              <label className="input-label">If False</label>
              <select
                className="input-field"
                value={config.on_false_action || 'continue'}
                onChange={(e) => onChange({ ...config, on_false_action: e.target.value })}
              >
                <option value="continue">Continue</option>
                <option value="skip_next">Skip Next Step</option>
              </select>
            </div>
          </div>
        </div>
      );

    case 'db_write':
      return (
        <div className="flex-col gap-sm">
          <div>
            <label className="input-label">Table Name</label>
            <input
              className="input-field"
              placeholder="public.workflow_results"
              value={config.table_name || ''}
              onChange={(e) => onChange({ ...config, table_name: e.target.value })}
            />
          </div>
          <div>
            <label className="input-label">Data Template (JSON)</label>
            <textarea
              className="input-field"
              placeholder='{"result": "{{previous.response}}", "timestamp": "{{input.started_at}}"}'
              value={typeof config.data_template === 'string' ? config.data_template : JSON.stringify(config.data_template || {}, null, 2)}
              onChange={(e) => {
                try { onChange({ ...config, data_template: JSON.parse(e.target.value) }); }
                catch { onChange({ ...config, data_template: e.target.value }); }
              }}
            />
          </div>
        </div>
      );

    case 'notify':
      return (
        <div className="flex-col gap-sm">
          <div>
            <label className="input-label">Channel</label>
            <select
              className="input-field"
              value={config.channel || 'log'}
              onChange={(e) => onChange({ ...config, channel: e.target.value })}
            >
              <option value="log">Log (Event Trigger)</option>
              <option value="slack">Slack Webhook</option>
              <option value="email">Email</option>
            </select>
          </div>
          {config.channel === 'slack' && (
            <div>
              <label className="input-label">Slack Webhook URL</label>
              <input
                className="input-field"
                placeholder="https://hooks.slack.com/services/..."
                value={config.webhook_url || ''}
                onChange={(e) => onChange({ ...config, webhook_url: e.target.value })}
              />
            </div>
          )}
          <div>
            <label className="input-label">Message Template</label>
            <textarea
              className="input-field"
              placeholder="Workflow completed: {{previous.response}}"
              value={config.message_template || ''}
              onChange={(e) => onChange({ ...config, message_template: e.target.value })}
            />
          </div>
        </div>
      );

    case 'approval_gate':
      return (
        <div style={{ padding: 16, background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
          <p className="text-sm text-muted">
            ✋ This step pauses the workflow and waits for an <strong>owner</strong> or <strong>editor</strong> to approve it.
            The run status will show as &quot;paused&quot; until approved.
          </p>
        </div>
      );

    default:
      return <p className="text-muted">Select a step type to configure it.</p>;
  }
}

function WorkflowBuilderContent() {
  const { isAuthenticated, isLoading, currentOrg, currentRole, graphqlRequest } = useAuth();
  const router = useRouter();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);
  const [triggers, setTriggers] = useState<Trigger[]>([{ id: uuidv4(), trigger_type: 'manual', config: {} }]);
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.push('/auth/login');
      } else if (!currentOrg || (currentRole !== 'owner' && currentRole !== 'editor')) {
        router.push('/dashboard');
      }
    }
  }, [isLoading, isAuthenticated, currentOrg, currentRole, router]);

  if (isLoading || !isAuthenticated || !currentOrg || (currentRole !== 'owner' && currentRole !== 'editor')) {
    return <div className="auth-container"><div className="spinner spinner-lg" /></div>;
  }

  const addStep = (stepType: string) => {
    const newStep: Step = {
      id: uuidv4(),
      step_type: stepType,
      name: STEP_TYPES.find(s => s.value === stepType)?.label || stepType,
      config: stepType === 'conditional_branch' ? {
        condition_field: 'response',
        operator: 'contains',
        value: 'positive',
        on_true_action: 'continue',
        on_false_action: 'skip_next',
      } : stepType === 'llm_call' ? {
        prompt: '',
        system_prompt: 'You are a helpful assistant.',
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1024,
        temperature: 0.7,
      } : stepType === 'http_request' ? {
        method: 'POST',
        url: 'https://httpbin.org/post',
        body_template: '{"data": "{{previous.response}}"}',
      } : {},
    };
    setSteps([...steps, newStep]);
    setActiveStep(newStep.id);
  };

  const removeStep = (id: string) => {
    setSteps(steps.filter(s => s.id !== id));
    if (activeStep === id) setActiveStep(null);
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const newSteps = [...steps];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= steps.length) return;
    [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]];
    setSteps(newSteps);
  };

  const updateStepConfig = (id: string, config: Record<string, any>) => {
    setSteps(steps.map(s => s.id === id ? { ...s, config } : s));
  };

  const updateStepName = (id: string, newName: string) => {
    setSteps(steps.map(s => s.id === id ? { ...s, name: newName } : s));
  };

  const addTrigger = (triggerType: string) => {
    const newTrigger: Trigger = {
      id: uuidv4(),
      trigger_type: triggerType,
      config: {},
      webhook_token: triggerType === 'webhook' ? uuidv4() : undefined,
    };
    setTriggers([...triggers, newTrigger]);
  };

  const removeTrigger = (id: string) => {
    setTriggers(triggers.filter(t => t.id !== id));
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('Workflow name is required'); return; }
    if (steps.length === 0) { setError('Add at least one step'); return; }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // Create workflow
      const wfData = await graphqlRequest(
        `mutation CreateWorkflow($object: workflows_insert_input!) {
          insert_workflows_one(object: $object) { id name }
        }`,
        {
          object: {
            org_id: currentOrg.organization.id,
            name: name.trim(),
            description: description.trim(),
            is_active: true,
          }
        }
      );

      const workflowId = wfData.insert_workflows_one.id;

      // Insert steps
      if (steps.length > 0) {
        await graphqlRequest(
          `mutation InsertSteps($objects: [workflow_steps_insert_input!]!) {
            insert_workflow_steps(objects: $objects) { affected_rows }
          }`,
          {
            objects: steps.map((step, i) => ({
              workflow_id: workflowId,
              step_order: i + 1,
              step_type: step.step_type,
              name: step.name,
              config: step.config,
            }))
          }
        );
      }

      // Insert triggers
      if (triggers.length > 0) {
        await graphqlRequest(
          `mutation InsertTriggers($objects: [workflow_triggers_insert_input!]!) {
            insert_workflow_triggers(objects: $objects) { affected_rows }
          }`,
          {
            objects: triggers.map(t => ({
              workflow_id: workflowId,
              trigger_type: t.trigger_type,
              config: t.config,
              is_active: true,
              webhook_token: t.webhook_token || null,
            }))
          }
        );
      }

      setSuccess('Workflow created!');
      setTimeout(() => router.push('/dashboard'), 1000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const allowedSteps = STEP_TYPES.filter(s => !s.ownerOnly || currentRole === 'owner');

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">New Workflow</h1>
            <p className="page-subtitle">Build an AI agent workflow with chained steps</p>
          </div>
          <div className="flex gap-sm">
            <button className="btn btn-ghost" onClick={() => router.push('/dashboard')}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <span className="spinner" /> : null}
              Save Workflow
            </button>
          </div>
        </div>

        {error && <div className="error-message mb-md">{error}</div>}
        {success && <div className="success-message mb-md">{success}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24 }}>
          {/* Left: Workflow config + step list */}
          <div className="flex-col gap-lg">
            {/* Workflow meta */}
            <div className="glass-card-static" style={{ padding: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Workflow Details</h2>
              <div className="flex-col gap-sm">
                <div>
                  <label className="input-label">Name</label>
                  <input
                    className="input-field"
                    placeholder="My AI Workflow"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="input-label">Description</label>
                  <input
                    className="input-field"
                    placeholder="What does this workflow do?"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Steps list */}
            <div className="glass-card-static" style={{ padding: 20 }}>
              <div className="flex items-center justify-between mb-md">
                <h2 style={{ fontSize: 16, fontWeight: 600 }}>Steps ({steps.length})</h2>
              </div>

              {steps.length === 0 ? (
                <div className="empty-state" style={{ padding: 32 }}>
                  <div className="empty-state-icon" style={{ fontSize: 32 }}>🔗</div>
                  <p className="text-muted">Add steps from the panel on the right</p>
                </div>
              ) : (
                <div className="flex-col">
                  {steps.map((step, index) => (
                    <React.Fragment key={step.id}>
                      {index > 0 && <div className="step-connector" />}
                      <div
                        className={`step-card ${activeStep === step.id ? 'active' : ''}`}
                        onClick={() => setActiveStep(activeStep === step.id ? null : step.id)}
                      >
                        <div className="step-number">{index + 1}</div>
                        <div style={{ flex: 1 }}>
                          <div className="flex items-center gap-sm">
                            <input
                              className="input-field"
                              style={{ background: 'transparent', border: 'none', padding: 0, fontSize: 14, fontWeight: 600 }}
                              value={step.name}
                              onChange={(e) => updateStepName(step.id, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span className={`step-badge step-badge-${step.step_type}`}>{step.step_type.replace('_', ' ')}</span>
                          </div>
                        </div>
                        <div className="flex gap-sm">
                          <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); moveStep(index, 'up'); }} disabled={index === 0}>↑</button>
                          <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); moveStep(index, 'down'); }} disabled={index === steps.length - 1}>↓</button>
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--status-failed)' }} onClick={(e) => { e.stopPropagation(); removeStep(step.id); }}>✕</button>
                        </div>
                      </div>

                      {/* Config form (expanded) */}
                      {activeStep === step.id && (
                        <div style={{ padding: '12px 16px 12px 52px', animation: 'slideUp 0.2s ease' }}>
                          <StepConfigForm
                            step={step}
                            onChange={(config) => updateStepConfig(step.id, config)}
                          />
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>

            {/* Triggers */}
            <div className="glass-card-static" style={{ padding: 20 }}>
              <div className="flex items-center justify-between mb-md">
                <h2 style={{ fontSize: 16, fontWeight: 600 }}>Triggers ({triggers.length})</h2>
              </div>

              <div className="flex-col gap-sm">
                {triggers.map((trigger) => (
                  <div key={trigger.id} className="step-card">
                    <span className={`trigger-badge trigger-badge-${trigger.trigger_type}`}>
                      {TRIGGER_TYPES.find(t => t.value === trigger.trigger_type)?.icon}{' '}
                      {trigger.trigger_type.replace('_', ' ')}
                    </span>
                    {trigger.webhook_token && (
                      <span className="text-xs font-mono text-muted" style={{ flex: 1 }}>
                        Token: {trigger.webhook_token.substring(0, 8)}...
                      </span>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--status-failed)' }}
                      onClick={() => removeTrigger(trigger.id)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-sm mt-md" style={{ flexWrap: 'wrap' }}>
                {TRIGGER_TYPES.filter(t => !triggers.some(tr => tr.trigger_type === t.value)).map((t) => (
                  <button key={t.value} className="btn btn-ghost btn-sm" onClick={() => addTrigger(t.value)}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Step palette */}
          <div className="glass-card-static" style={{ padding: 20, position: 'sticky', top: 24, alignSelf: 'start' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Add Step</h2>
            <div className="flex-col gap-sm">
              {allowedSteps.map((st) => (
                <button
                  key={st.value}
                  className="btn btn-ghost"
                  style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '12px 14px' }}
                  onClick={() => addStep(st.value)}
                >
                  <span style={{ fontSize: 20, width: 28 }}>{st.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{st.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 400 }}>{st.description}</div>
                  </div>
                  {st.ownerOnly && (
                    <span className="badge" style={{ marginLeft: 'auto', fontSize: 9, padding: '1px 6px', background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>
                      Owner
                    </span>
                  )}
                </button>
              ))}
            </div>

            {currentRole !== 'owner' && (
              <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                <p className="text-xs text-muted">
                  🔒 Some step types (DB Write, Notify) require <strong>owner</strong> role.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function NewWorkflowPage() {
  return (
    <ClientLayout>
      <WorkflowBuilderContent />
    </ClientLayout>
  );
}
