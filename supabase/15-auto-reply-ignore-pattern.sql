-- Per-page auto-reply echo ignore pattern.
-- Used to ignore Botcake-style Page echoes while still pausing AI for owner replies.

alter table public.clients
  add column if not exists auto_reply_ignore_pattern text not null default '';

update public.clients
set auto_reply_ignore_pattern = coalesce(auto_reply_ignore_pattern, '');

alter table public.clients
  alter column auto_reply_ignore_pattern set default '',
  alter column auto_reply_ignore_pattern set not null;
