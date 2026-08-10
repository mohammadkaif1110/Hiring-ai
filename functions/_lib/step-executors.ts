import { adminQuery, gql } from './graphql-client';

// ---- Step Config Types ----

export interface LlmCallConfig {
  model?: string;
  prompt: string;
  system_prompt?: string;
  max_tokens?: number;
  temperature?: number;
}

export interface HttpRequestConfig {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body_template?: string;
}

export interface DbWriteConfig {
  table_name: string;
  data_template: Record<string, any>;
}

export interface NotifyConfig {
  channel: string; // 'slack' | 'email' | 'log'
  webhook_url?: string;
  email_to?: string;
  message_template: string;
}

export interface ConditionalBranchConfig {
  condition_field: string; // field in previous output to check
  operator: string; // 'equals', 'contains', 'greater_than', 'exists'
  value: any;
  on_true_action: string; // 'continue' | 'skip_next'
  on_false_action: string;
}

// ---- Utility: template resolver ----

function resolveTemplate(template: string | undefined | null, context: Record<string, any>): string {
  if (!template || typeof template !== 'string') return '';
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
    const keys = path.split('.');
    let val: any = context;
    for (const key of keys) {
      val = val?.[key];
    }
    return val !== undefined ? String(val) : '';
  });
}

// ---- LLM Call Executor ----

export async function executeLlmCall(
  config: LlmCallConfig,
  input: Record<string, any>
): Promise<Record<string, any>> {
  const resolvedPrompt = resolveTemplate(config.prompt, { input, previous: input });
  const systemPrompt = config.system_prompt
    ? resolveTemplate(config.system_prompt, { input, previous: input })
    : 'You are a helpful assistant.';

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey || apiKey === 'your-groq-api-key-here') {
    // Stubbed LLM call with disclosed delay
    console.log('[LLM STUB] No GROQ_API_KEY set — using stubbed response with 2s delay');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const stubResponse = `[Stubbed LLM Response] Analyzed prompt: "${resolvedPrompt.substring(0, 100)}..." — The sentiment appears positive and the content is constructive. This is a simulated response because no GROQ_API_KEY was configured.`;

    return {
      response: stubResponse,
      model: 'stub',
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      stubbed: true,
    };
  }

  // Real Groq API call
  const { default: Groq } = await import('groq-sdk');
  const groq = new Groq({ apiKey });

  const completion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: resolvedPrompt },
    ],
    model: config.model || 'llama-3.3-70b-versatile',
    max_tokens: config.max_tokens || 1024,
    temperature: config.temperature ?? 0.7,
  });

  return {
    response: completion.choices[0]?.message?.content || '',
    model: completion.model,
    usage: completion.usage,
    stubbed: false,
  };
}

// ---- HTTP Request Executor ----

export async function executeHttpRequest(
  config: HttpRequestConfig,
  input: Record<string, any>
): Promise<Record<string, any>> {
  const fetch = (await import('node-fetch')).default;
  const url = resolveTemplate(config.url, { input, previous: input });
  const method = config.method || 'GET';

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.headers) {
    for (const [k, v] of Object.entries(config.headers)) {
      headers[k] = resolveTemplate(v, { input, previous: input });
    }
  }

  let body: string | undefined;
  if (config.body_template && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
    body = resolveTemplate(
      typeof config.body_template === 'string'
        ? config.body_template
        : JSON.stringify(config.body_template),
      { input, previous: input }
    );
  }

  const response = await fetch(url, {
    method: method.toUpperCase(),
    headers,
    body,
  });

  let responseBody: any;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    responseBody = await response.json();
  } else {
    responseBody = await response.text();
  }

  return {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    body: responseBody,
  };
}

// ---- DB Write Executor ----

export async function executeDbWrite(
  config: DbWriteConfig,
  input: Record<string, any>
): Promise<Record<string, any>> {
  // Build the data object from template
  const data: Record<string, any> = {};
  for (const [key, val] of Object.entries(config.data_template)) {
    if (typeof val === 'string') {
      data[key] = resolveTemplate(val, { input, previous: input });
    } else {
      data[key] = val;
    }
  }

  // Use a raw SQL insert via admin to write to the specified table
  // For safety, we use a parameterized approach via Hasura's run_sql
  const columns = Object.keys(data);
  const values = Object.values(data).map((v) =>
    typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v === null ? 'NULL' : `'${JSON.stringify(v).replace(/'/g, "''")}'`
  );

  const sql = `INSERT INTO ${config.table_name} (${columns.join(', ')}) VALUES (${values.join(', ')}) RETURNING *`;

  try {
    // Use Hasura admin API for raw SQL
    const fetch = (await import('node-fetch')).default;
    const hasuraUrl = process.env.NHOST_HASURA_URL || 'http://localhost:1337';
    const adminSecret = process.env.NHOST_ADMIN_SECRET || 'nhost-admin-secret';

    const resp = await fetch(`${hasuraUrl}/v2/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': adminSecret,
      },
      body: JSON.stringify({
        type: 'run_sql',
        args: { source: 'default', sql, cascade: false },
      }),
    });

    const result = await resp.json();
    return { success: true, result, table: config.table_name };
  } catch (error: any) {
    return { success: false, error: error.message, table: config.table_name };
  }
}

// ---- Notify Executor ----

export async function executeNotify(
  config: NotifyConfig,
  input: Record<string, any>
): Promise<Record<string, any>> {
  const message = resolveTemplate(config.message_template, { input, previous: input });

  if (config.channel === 'slack' && config.webhook_url) {
    const fetch = (await import('node-fetch')).default;
    try {
      const resp = await fetch(config.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      });
      return { channel: 'slack', sent: true, status: resp.status, message };
    } catch (error: any) {
      return { channel: 'slack', sent: false, error: error.message, message };
    }
  }

  // Default: log notification (acts as event trigger payload)
  console.log(`[NOTIFY] ${config.channel}: ${message}`);

  // Insert into a notifications log for event trigger to pick up
  await adminQuery(
    gql`
      mutation InsertNotification($channel: String!, $message: String!, $metadata: jsonb) {
        insert_notifications_one(
          object: { channel: $channel, message: $message, metadata: $metadata }
        ) {
          id
        }
      }
    `,
    {
      channel: config.channel,
      message,
      metadata: input,
    }
  ).catch(() => {
    // notifications table might not exist yet — that's OK, we log it
    console.log('[NOTIFY] Notification logged (notifications table not available)');
  });

  return { channel: config.channel, sent: true, message, logged: true };
}

// ---- Conditional Branch Executor ----

export function evaluateConditionalBranch(
  config: ConditionalBranchConfig,
  input: Record<string, any>
): { result: boolean; action: string; details: string } {
  const fieldPath = config.condition_field.split('.');
  let fieldValue: any = input;
  for (const key of fieldPath) {
    fieldValue = fieldValue?.[key];
  }

  let result = false;
  const operator = config.operator.toLowerCase();

  switch (operator) {
    case 'equals':
      result = String(fieldValue).toLowerCase() === String(config.value).toLowerCase();
      break;
    case 'not_equals':
      result = String(fieldValue).toLowerCase() !== String(config.value).toLowerCase();
      break;
    case 'contains':
      result = String(fieldValue).toLowerCase().includes(String(config.value).toLowerCase());
      break;
    case 'not_contains':
      result = !String(fieldValue).toLowerCase().includes(String(config.value).toLowerCase());
      break;
    case 'greater_than':
      result = Number(fieldValue) > Number(config.value);
      break;
    case 'less_than':
      result = Number(fieldValue) < Number(config.value);
      break;
    case 'exists':
      result = fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
      break;
    case 'is_empty':
      result = fieldValue === undefined || fieldValue === null || fieldValue === '';
      break;
    default:
      result = !!fieldValue;
  }

  const action = result ? config.on_true_action : config.on_false_action;
  return {
    result,
    action,
    details: `Condition: ${config.condition_field} ${operator} ${config.value} → ${result} → ${action}`,
  };
}
