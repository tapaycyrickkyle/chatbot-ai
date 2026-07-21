-- Adds a per-client Google Sheets tab name for lead capture routing.

alter table public.clients
  add column if not exists google_sheets_tab_name text not null default 'Sheet1';

update public.clients
set google_sheets_tab_name = coalesce(nullif(google_sheets_tab_name, ''), 'Sheet1');

alter table public.clients
  alter column google_sheets_tab_name set default 'Sheet1',
  alter column google_sheets_tab_name set not null;
