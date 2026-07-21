-- Stores the last AI reply so short customer follow-ups like "yes" keep context.

alter table public.ai_conversations
  add column if not exists last_ai_reply text;
