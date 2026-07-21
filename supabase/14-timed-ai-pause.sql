-- Timed AI pause for manual business-owner replies.

alter table public.clients
  add column if not exists manual_ai_pause_minutes integer not null default 5;

update public.clients
set manual_ai_pause_minutes = coalesce(manual_ai_pause_minutes, 5);

alter table public.clients
  alter column manual_ai_pause_minutes set default 5,
  alter column manual_ai_pause_minutes set not null;

alter table public.ai_conversations
  add column if not exists ai_pause_expires_at timestamptz;
