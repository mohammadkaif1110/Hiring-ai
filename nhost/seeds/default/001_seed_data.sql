-- ============================================================
-- Seed Data: Two organizations, users, and a sample workflow
-- Run this after migrations and after creating test users via nhost auth
-- ============================================================

-- NOTE: You must first create users via the nhost auth API or dashboard.
-- Then replace the placeholder UUIDs below with actual user IDs.
-- The seed script uses placeholder UUIDs that you should update.

-- Organization 1: Acme Corp
INSERT INTO organizations (id, name, slug, quota_limit, quota_used) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Acme Corp', 'acme-corp', 100, 0);

-- Organization 2: Beta Inc
INSERT INTO organizations (id, name, slug, quota_limit, quota_used) VALUES
  ('00000000-0000-0000-0000-000000000002', 'Beta Inc', 'beta-inc', 50, 0);

-- Sample Workflow for Acme Corp: "Sentiment Analysis Pipeline"
INSERT INTO workflows (id, org_id, name, description, is_active) VALUES
  ('10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001',
   'Sentiment Analysis Pipeline',
   'Analyzes text sentiment via LLM, branches on result, and requests approval before saving',
   true);

-- Steps for the pipeline
INSERT INTO workflow_steps (workflow_id, step_order, step_type, name, config) VALUES
  -- Step 1: LLM Call - Sentiment Analysis
  ('10000000-0000-0000-0000-000000000001', 1, 'llm_call', 'Analyze Sentiment',
   '{"prompt": "Analyze the sentiment of the following text and respond with exactly one word: positive, negative, or neutral. Text: The product launch exceeded all expectations and customers are thrilled with the new features.", "system_prompt": "You are a sentiment analysis expert. Respond with exactly one word: positive, negative, or neutral.", "model": "llama-3.3-70b-versatile", "max_tokens": 50, "temperature": 0.1}'::jsonb),

  -- Step 2: Conditional Branch
  ('10000000-0000-0000-0000-000000000001', 2, 'conditional_branch', 'Check if Positive',
   '{"condition_field": "response", "operator": "contains", "value": "positive", "on_true_action": "continue", "on_false_action": "skip_next"}'::jsonb),

  -- Step 3: HTTP Request (only runs if positive)
  ('10000000-0000-0000-0000-000000000001', 3, 'http_request', 'Post to External API',
   '{"method": "POST", "url": "https://httpbin.org/post", "body_template": "{\"sentiment\": \"{{previous.result}}\", \"action\": \"positive_detected\"}"}'::jsonb),

  -- Step 4: Approval Gate
  ('10000000-0000-0000-0000-000000000001', 4, 'approval_gate', 'Human Review', '{}'::jsonb),

  -- Step 5: Notify
  ('10000000-0000-0000-0000-000000000001', 5, 'notify', 'Send Notification',
   '{"channel": "log", "message_template": "Sentiment analysis complete. Result: {{previous.response}}"}'::jsonb);

-- Triggers for the pipeline
INSERT INTO workflow_triggers (workflow_id, trigger_type, config, is_active, webhook_token) VALUES
  ('10000000-0000-0000-0000-000000000001', 'manual', '{}'::jsonb, true, null),
  ('10000000-0000-0000-0000-000000000001', 'webhook', '{}'::jsonb, true, 'acme-webhook-token-12345');

-- ============================================================
-- INSTRUCTIONS:
-- After creating test users via nhost:
-- 1. Find user IDs in the auth.users table
-- 2. Run these inserts with actual user IDs:
--
-- -- Acme Corp: owner
-- INSERT INTO org_members (user_id, org_id, role)
-- VALUES ('<USER_A_ID>', '00000000-0000-0000-0000-000000000001', 'owner');
--
-- -- Acme Corp: editor
-- INSERT INTO org_members (user_id, org_id, role)
-- VALUES ('<USER_B_ID>', '00000000-0000-0000-0000-000000000001', 'editor');
--
-- -- Beta Inc: owner
-- INSERT INTO org_members (user_id, org_id, role)
-- VALUES ('<USER_C_ID>', '00000000-0000-0000-0000-000000000002', 'owner');
-- ============================================================
