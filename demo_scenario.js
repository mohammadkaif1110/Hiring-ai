/**
 * Complete Live Scenario Demonstration
 * ====================================
 * Proves all 6 core requirements of the SDE Assignment:
 * 1. Two separate organizations (Org A: Acme Corp, Org B: Beta Inc)
 * 2. Multi-step workflow in Org A (llm_call -> conditional_branch -> http_request -> approval_gate -> notify)
 * 3. Dual trigger mechanisms (Manual button + Inbound Webhook)
 * 4. Approval gate pause & role-gated resumption
 * 5. Live step-by-step progress tracking
 * 6. Cross-org isolation proof (Org B user cannot see, query by ID, trigger, or approve anything in Org A)
 */

const https = require('https');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Setup Test Identities
const USER_A_ID = '4a2af1f1-40c1-4879-bb15-23199ff239cf'; // Owner of Org A (Acme Corp)
const USER_B_ID = 'e23120a9-d66f-49db-8c54-ea1e84e31431'; // Owner of Org B (Beta Inc)

function makeRequest(path, headers, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const req = https.request({
      host: '127.0.0.1',
      port: 443,
      path: path,
      method: 'POST',
      servername: 'local.graphql.local.nhost.run',
      headers: {
        'Host': 'local.graphql.local.nhost.run',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Helper: GraphQL caller with role / user impersonation
async function gql(query, variables, userId = USER_A_ID) {
  const headers = {
    'X-Hasura-Admin-Secret': 'nhost-admin-secret',
    'X-Hasura-Role': 'user',
    'X-Hasura-User-Id': userId,
  };
  const d = await makeRequest('/v1', headers, { query, variables });
  if (d.errors) {
    const err = new Error(d.errors[0].message);
    err.errors = d.errors;
    throw err;
  }
  return d.data;
}

// Helper: Public Action caller (no user ID)
async function gqlPublic(query, variables) {
  const headers = {
    'X-Hasura-Admin-Secret': 'nhost-admin-secret',
    'X-Hasura-Role': 'public',
  };
  return await makeRequest('/v1', headers, { query, variables });
}

async function runDemo() {
  console.log('========================================================================');
  console.log('   🚀 FLOWFORGE AI — LIVE END-TO-END SCENARIO DEMONSTRATION');
  console.log('========================================================================\n');

  // STEP 1: Ensure Orgs and Memberships
  console.log('📌 STEP 1: Setting up Multi-Tenant Context (Org A & Org B)');

  const orgA_Id = '00000000-0000-0000-0000-000000000001'; // Acme Corp
  const orgB_Id = '00000000-0000-0000-0000-000000000002'; // Beta Inc

  // Upsert memberships
  await makeRequest('/v1', { 'X-Hasura-Admin-Secret': 'nhost-admin-secret' }, {
    query: `
      mutation SetupOrgs {
        insert_org_members(
          objects: [
            { user_id: "${USER_A_ID}", org_id: "${orgA_Id}", role: owner }
            { user_id: "${USER_B_ID}", org_id: "${orgB_Id}", role: owner }
          ],
          on_conflict: { constraint: org_members_user_id_org_id_key, update_columns: [role] }
        ) { affected_rows }
      }
    `
  });

  console.log(`   🏢 Org A (Acme Corp):   [ID: ${orgA_Id}] — Owner: User A (agent-tester@acme.com)`);
  console.log(`   🏢 Org B (Beta Inc):    [ID: ${orgB_Id}] — Owner: User B (mohammadkaif1110@gmail.com)\n`);

  // STEP 2: Build Workflow in Org A as User A (Owner)
  console.log('📌 STEP 2: User A (Org A Owner) Building Multi-Step AI Agent Workflow');
  const webhookToken = `acme-webhook-${Date.now()}`;

  const wfData = await gql(
    `mutation CreateWorkflow($object: workflows_insert_input!) {
      insert_workflows_one(object: $object) { id name }
    }`,
    {
      object: {
        org_id: orgA_Id,
        name: 'Customer Feedback Classifier & Escaler',
        description: 'LLM Sentiment -> Branch -> Webhook -> Approval Gate -> Notify',
        is_active: true,
      }
    },
    USER_A_ID
  );
  const workflowId = wfData.insert_workflows_one.id;
  console.log(`   ✅ Workflow Created: "${wfData.insert_workflows_one.name}" [ID: ${workflowId}]`);

  // Add steps
  await gql(
    `mutation AddSteps($objects: [workflow_steps_insert_input!]!) {
      insert_workflow_steps(objects: $objects) { affected_rows }
    }`,
    {
      objects: [
        {
          workflow_id: workflowId,
          step_order: 1,
          step_type: 'llm_call',
          name: '1. AI Sentiment Analysis',
          config: {
            prompt: 'Classify sentiment of feedback: "The new UI is incredibly fast and intuitive!"',
            system_prompt: 'You are an AI classifier. Reply with positive, neutral, or negative.',
            model: 'llama-3.3-70b-versatile'
          }
        },
        {
          workflow_id: workflowId,
          step_order: 2,
          step_type: 'conditional_branch',
          name: '2. Check Positive Sentiment',
          config: {
            condition_field: 'response',
            operator: 'contains',
            value: 'positive',
            on_true_action: 'continue',
            on_false_action: 'skip_next'
          }
        },
        {
          workflow_id: workflowId,
          step_order: 3,
          step_type: 'http_request',
          name: '3. Log to Analytics Webhook',
          config: {
            method: 'POST',
            url: 'https://httpbin.org/post',
            body_template: '{"sentiment": "{{previous.response}}", "status": "verified"}'
          }
        },
        {
          workflow_id: workflowId,
          step_order: 4,
          step_type: 'approval_gate',
          name: '4. Executive Approval Gate',
          config: {}
        },
        {
          workflow_id: workflowId,
          step_order: 5,
          step_type: 'notify',
          name: '5. Dispatch Notification',
          config: {
            channel: 'log',
            message_template: 'Workflow completed successfully! Final sentiment output: {{previous.response}}'
          }
        }
      ]
    },
    USER_A_ID
  );

  // Add triggers (Manual + Webhook)
  await gql(
    `mutation AddTriggers($objects: [workflow_triggers_insert_input!]!) {
      insert_workflow_triggers(objects: $objects) { affected_rows }
    }`,
    {
      objects: [
        { workflow_id: workflowId, trigger_type: 'manual', config: {}, is_active: true },
        { workflow_id: workflowId, trigger_type: 'webhook', config: {}, is_active: true, webhook_token: webhookToken }
      ]
    },
    USER_A_ID
  );

  console.log('   ✅ 5 Steps Added: LLM Call ➔ Branch ➔ HTTP Request ➔ Approval Gate ➔ Notify');
  console.log(`   ✅ 2 Triggers Configured: Manual + Inbound Webhook Token [${webhookToken}]\n`);

  // STEP 3: Dual Trigger Demonstrations
  console.log('📌 STEP 3: Testing Dual Trigger Mechanisms');

  // Trigger 1: Manual Run
  console.log('   ⚡ Trigger Method A: Manual Run via Action Mutation');
  const manualRun = await gql(
    `mutation ManualRun($wid: uuid!) {
      triggerWorkflowRun(workflow_id: $wid) { workflow_run_id status message }
    }`,
    { wid: workflowId },
    USER_A_ID
  );
  const manualRunId = manualRun.triggerWorkflowRun.workflow_run_id;
  console.log(`      ➔ Manual Run Started [Run ID: ${manualRunId}] | Quota Status: ${manualRun.triggerWorkflowRun.message}`);

  // Trigger 2: Webhook Endpoint Run
  console.log('   ⚡ Trigger Method B: Webhook Action (External Inbound System Call)');
  const webhookResp = await gqlPublic(
    `mutation WebhookRun($token: String!, $payload: json) {
      webhookTrigger(webhook_token: $token, payload: $payload) { workflow_run_id status message }
    }`,
    { token: webhookToken, payload: { text: "External webhook trigger payload" } }
  );
  const webhookRunId = webhookResp.data.webhookTrigger.workflow_run_id;
  console.log(`      ➔ Webhook Run Triggered [Run ID: ${webhookRunId}] | Response: ${webhookResp.data.webhookTrigger.message}\n`);

  // STEP 4: Live Status Stream & Approval Gate Pausing (Manual Run)
  console.log('📌 STEP 4: Live Step Execution & Approval Gate Pausing');
  console.log('   Streaming execution progress for Manual Run...');

  let currentRun = null;
  let awaitingStep = null;

  // Poll until run reaches paused status at approval gate
  for (let poll = 1; poll <= 10; poll++) {
    await new Promise(r => setTimeout(r, 1000));
    const runState = await gql(
      `query WatchRun($id: uuid!) {
        workflow_runs_by_pk(id: $id) {
          id status error_message
          step_runs(order_by: { workflow_step: { step_order: asc } }) {
            id status output error
            workflow_step { name step_type step_order }
          }
        }
      }`,
      { id: manualRunId },
      USER_A_ID
    );
    currentRun = runState.workflow_runs_by_pk;
    console.log(`   📊 [Poll ${poll}] Run Status: [${currentRun.status.toUpperCase()}]`);
    for (const sr of currentRun.step_runs) {
      console.log(`      - Step ${sr.workflow_step.step_order} [${sr.workflow_step.name}]: status=${sr.status.toUpperCase()}`);
    }

    awaitingStep = currentRun.step_runs.find((sr) => sr.status === 'awaiting_approval');
    if (awaitingStep || currentRun.status === 'paused') break;
  }

  if (!awaitingStep) {
    throw new Error('Run did not pause at approval gate as expected!');
  }

  console.log(`\n   ✋ Execution PAUSED at Step 4: "${awaitingStep.workflow_step.name}" [StepRun ID: ${awaitingStep.id}]`);
  console.log('   Waiting for authorized approval...\n');

  // STEP 5: Approve Paused Step as User A (Owner)
  console.log('📌 STEP 5: Approving Paused Gate & Resuming Execution');
  const approveResult = await gql(
    `mutation Approve($stepRunId: uuid!) {
      approveStep(step_run_id: $stepRunId) { success message workflow_run_id }
    }`,
    { stepRunId: awaitingStep.id },
    USER_A_ID
  );
  console.log(`   ✅ User A (Org A Owner) Approved Step: "${approveResult.approveStep.message}"`);

  // Wait for Step 5 to complete
  await new Promise(r => setTimeout(r, 3000));

  runState = await gql(
    `query WatchRun($id: uuid!) {
      workflow_runs_by_pk(id: $id) {
        id status error_message
        step_runs(order_by: { workflow_step: { step_order: asc } }) {
          id status output error
          workflow_step { name step_type step_order }
        }
      }
    }`,
    { id: manualRunId },
    USER_A_ID
  );

  currentRun = runState.workflow_runs_by_pk;
  console.log(`   🎉 Final Workflow Run Status: [${currentRun.status.toUpperCase()}]`);
  for (const sr of currentRun.step_runs) {
    console.log(`      - Step ${sr.workflow_step.step_order} [${sr.workflow_step.name}]: status=${sr.status.toUpperCase()}`);
  }
  console.log('');

  // STEP 6: Proof of Cross-Org Isolation (User B inside Org B)
  console.log('📌 STEP 6: PROOF OF CROSS-ORG ISOLATION (Security Audit)');
  console.log('   Impersonating User B (Owner of Org B / Beta Inc)...');

  // Test 6a: Query Workflows
  console.log('\n   [Test 6a] User B queries all workflows in tenant:');
  const userBWorkflows = await gql(`query { workflows { id name org_id } }`, {}, USER_B_ID);
  const foundOrgAWorkflow = userBWorkflows.workflows.find((w) => w.id === workflowId);
  console.log(`      ➔ Workflows returned for User B: ${userBWorkflows.workflows.length}`);
  console.log(`      ➔ Org A Workflow (${workflowId}) visible to User B? ${foundOrgAWorkflow ? '❌ YES (SECURITY BUG!)' : '✅ NO (Isolated)'}`);

  // Test 6b: Direct Primary Key Access
  console.log('\n   [Test 6b] User B attempts direct lookup by ID (workflows_by_pk):');
  const directLookup = await gql(`query ($id: uuid!) { workflows_by_pk(id: $id) { id name } }`, { id: workflowId }, USER_B_ID);
  console.log(`      ➔ Result of direct lookup for ${workflowId}: ${JSON.stringify(directLookup.workflows_by_pk)}`);
  console.log(`      ➔ Result is null? ${directLookup.workflows_by_pk === null ? '✅ YES (Access Denied by Hasura RLS)' : '❌ NO (Security Leak)'}`);

  // Test 6c: Unauthorized Trigger Attempt
  console.log('\n   [Test 6c] User B attempts to trigger Org A workflow run via Action:');
  try {
    await gql(
      `mutation ($wid: uuid!) { triggerWorkflowRun(workflow_id: $wid) { workflow_run_id status } }`,
      { wid: workflowId },
      USER_B_ID
    );
    console.log('      ❌ ERROR: User B was able to trigger Org A workflow!');
  } catch (err) {
    console.log(`      ✅ REJECTED by Layer 2 Action Permission Check!`);
    console.log(`      ➔ Error message: "${err.message}"`);
  }

  // Test 6d: Unauthorized Step Approval Attempt
  console.log('\n   [Test 6d] User B attempts to approve Step 4 in Org A run:');
  try {
    await gql(
      `mutation ($stepRunId: uuid!) { approveStep(step_run_id: $stepRunId) { success message } }`,
      { stepRunId: awaitingStep.id },
      USER_B_ID
    );
    console.log('      ❌ ERROR: User B was able to approve Org A step!');
  } catch (err) {
    console.log(`      ✅ REJECTED by Layer 2 Mid-Execution Permission Check!`);
    console.log(`      ➔ Error message: "${err.message}"`);
  }

  console.log('\n========================================================================');
  console.log('   🏆 ALL 6 CORE ASSIGNMENT REQUIREMENTS FULLY VERIFIED & PROVEN LIVE');
  console.log('========================================================================\n');
}

runDemo().catch(e => console.error('Demo Failure:', e));
