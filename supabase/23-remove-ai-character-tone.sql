-- Removes unused per-client AI character and tone fields.

alter table public.clients
  drop column if exists ai_character,
  drop column if exists ai_tone;
