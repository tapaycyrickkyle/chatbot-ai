-- Permanent minimal welcome receipt state.
-- Keeps "already received welcome sequence" even when full AI conversation
-- memory is cleaned up for storage retention.

create extension if not exists pgcrypto;

create table if not exists public.welcome_sequence_recipients (
  id uuid primary key default gen_random_uuid(),
  client_id integer not null references public.clients(id) on delete cascade,
  page_id text not null,
  recipient_id text not null,
  first_sent_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint welcome_sequence_recipients_client_recipient_key unique (client_id, recipient_id)
);

create index if not exists welcome_sequence_recipients_client_idx
  on public.welcome_sequence_recipients (client_id, updated_at desc);

insert into public.welcome_sequence_recipients (
  client_id,
  page_id,
  recipient_id,
  first_sent_at,
  updated_at
)
select
  client_id,
  page_id,
  recipient_id,
  coalesce(last_message_at, created_at, now()),
  coalesce(updated_at, last_message_at, now())
from public.ai_conversations
where welcome_sequence_sent = true
on conflict (client_id, recipient_id) do update
set
  page_id = excluded.page_id,
  updated_at = greatest(public.welcome_sequence_recipients.updated_at, excluded.updated_at);

alter table public.welcome_sequence_recipients enable row level security;

revoke all on table public.welcome_sequence_recipients from anon, authenticated;
