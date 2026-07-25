-- Message-level dedupe for Messenger webhook retries.

create extension if not exists pgcrypto;

create table if not exists public.processed_messenger_messages (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  page_id text not null,
  recipient_id text not null,
  message_id text not null,
  created_at timestamptz not null default now(),
  constraint processed_messenger_messages_event_key_key unique (event_key)
);

create index if not exists processed_messenger_messages_created_at_idx
  on public.processed_messenger_messages (created_at);

create index if not exists processed_messenger_messages_page_recipient_idx
  on public.processed_messenger_messages (page_id, recipient_id, created_at desc);

alter table public.processed_messenger_messages enable row level security;

revoke all on table public.processed_messenger_messages from anon, authenticated;
