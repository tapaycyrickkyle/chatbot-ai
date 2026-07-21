-- Adds separated AI personality controls and compact customer memory.

alter table public.clients
  add column if not exists ai_character text not null default '',
  add column if not exists ai_tone text not null default '';

update public.clients
set
  ai_character = coalesce(ai_character, ''),
  ai_tone = coalesce(ai_tone, '');

alter table public.clients
  alter column ai_character set default '',
  alter column ai_tone set default '',
  alter column ai_character set not null,
  alter column ai_tone set not null;

alter table public.ai_conversations
  add column if not exists conversation_summary text not null default '',
  add column if not exists customer_state jsonb not null default '{}'::jsonb,
  add column if not exists recent_messages jsonb not null default '[]'::jsonb;

update public.ai_conversations
set
  conversation_summary = coalesce(conversation_summary, ''),
  customer_state = coalesce(customer_state, '{}'::jsonb),
  recent_messages = coalesce(recent_messages, '[]'::jsonb);

alter table public.ai_conversations
  alter column conversation_summary set default '',
  alter column customer_state set default '{}'::jsonb,
  alter column recent_messages set default '[]'::jsonb,
  alter column conversation_summary set not null,
  alter column customer_state set not null,
  alter column recent_messages set not null;
