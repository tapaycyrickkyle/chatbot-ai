-- Owner handoff / AI pause state.
-- Used by /dashboard/clients/[id]/conversations and by the Messenger webhook.

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  client_id integer not null references public.clients(id) on delete cascade,
  page_id text not null,
  recipient_id text not null,
  last_customer_message text,
  last_ai_reply text,
  last_message_at timestamptz,
  ai_paused boolean not null default false,
  paused_at timestamptz,
  paused_by text,
  resumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_conversations_client_recipient_key unique (client_id, recipient_id)
);

alter table public.ai_conversations
  add column if not exists client_id integer;

alter table public.ai_conversations
  add column if not exists page_id text not null default '';

alter table public.ai_conversations
  add column if not exists recipient_id text not null default '';

alter table public.ai_conversations
  add column if not exists last_customer_message text;

alter table public.ai_conversations
  add column if not exists last_ai_reply text;

alter table public.ai_conversations
  add column if not exists ai_paused boolean not null default false;

alter table public.ai_conversations
  add column if not exists paused_at timestamptz;

alter table public.ai_conversations
  add column if not exists paused_by text;

alter table public.ai_conversations
  add column if not exists resumed_at timestamptz;

alter table public.ai_conversations
  add column if not exists created_at timestamptz not null default now();

alter table public.ai_conversations
  add column if not exists updated_at timestamptz not null default now();

alter table public.ai_conversations
  add column if not exists last_message_at timestamptz;

create index if not exists ai_conversations_client_last_message_idx
  on public.ai_conversations (client_id, last_message_at desc);

create index if not exists ai_conversations_client_paused_idx
  on public.ai_conversations (client_id, ai_paused);
