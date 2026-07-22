-- Locked-down RLS baseline.
-- The Next.js server uses SUPABASE_SERVICE_ROLE_KEY for database access after
-- app-level admin checks. Browser clients should not read/write app tables
-- directly, so this file enables RLS and removes direct anon/authenticated
-- table privileges.

alter table public.clients enable row level security;
alter table public.rate_limit_logs enable row level security;
alter table public.ai_conversations enable row level security;

revoke all on table public.clients from anon, authenticated;
revoke all on table public.rate_limit_logs from anon, authenticated;
revoke all on table public.ai_conversations from anon, authenticated;

revoke all on all sequences in schema public from anon, authenticated;
