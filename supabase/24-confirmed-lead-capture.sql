-- Confirmed lead capture with retry-safe Google Apps Script delivery.

alter table public.clients
  add column if not exists lead_capture_enabled boolean not null default false,
  add column if not exists lead_capture_fields text not null default 'Full Name|name\nPhone|phone',
  add column if not exists lead_capture_trigger text not null default '',
  add column if not exists lead_capture_offer text not null default '';

create table if not exists public.lead_records (
  id uuid primary key default gen_random_uuid(),
  client_id integer not null references public.clients(id) on delete cascade,
  page_id text not null,
  recipient_id text not null,
  fields jsonb not null default '{}'::jsonb,
  field_config jsonb not null default '[]'::jsonb,
  status text not null default 'collecting',
  delivery_attempts integer not null default 0,
  last_delivery_error text not null default '',
  confirmed_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_records_status_check check (status in ('collecting', 'awaiting_confirmation', 'confirmed', 'delivered', 'delivery_failed'))
);

create index if not exists lead_records_open_by_customer_idx
  on public.lead_records (client_id, recipient_id, created_at desc)
  where status in ('collecting', 'awaiting_confirmation');
create index if not exists lead_records_delivery_retry_idx
  on public.lead_records (status, updated_at)
  where status in ('confirmed', 'delivery_failed');

alter table public.lead_records enable row level security;
revoke all on table public.lead_records from anon, authenticated;
