-- One-time first reply sequence after the first inbound customer message.

alter table public.clients
  add column if not exists welcome_sequence_enabled boolean not null default false,
  add column if not exists welcome_message text not null default '',
  add column if not exists welcome_link_url text not null default '',
  add column if not exists welcome_image_urls text not null default '';

update public.clients
set
  welcome_sequence_enabled = coalesce(welcome_sequence_enabled, false),
  welcome_message = coalesce(welcome_message, ''),
  welcome_link_url = coalesce(welcome_link_url, ''),
  welcome_image_urls = coalesce(welcome_image_urls, '');

alter table public.clients
  alter column welcome_sequence_enabled set default false,
  alter column welcome_message set default '',
  alter column welcome_link_url set default '',
  alter column welcome_image_urls set default '',
  alter column welcome_sequence_enabled set not null,
  alter column welcome_message set not null,
  alter column welcome_link_url set not null,
  alter column welcome_image_urls set not null;

alter table public.ai_conversations
  add column if not exists welcome_sequence_sent boolean not null default false;
