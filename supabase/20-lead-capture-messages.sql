-- Optional two-message lead capture prompt.

alter table public.clients
  add column if not exists lead_capture_messages text not null default '';

update public.clients
set lead_capture_messages = coalesce(lead_capture_messages, '');

alter table public.clients
  alter column lead_capture_messages set default '',
  alter column lead_capture_messages set not null;
