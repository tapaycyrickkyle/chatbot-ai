-- Durable queue for Messenger webhook deliveries.

create extension if not exists pgcrypto;

create table if not exists public.ai_message_jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'messenger_webhook',
  body_hash text not null,
  payload jsonb not null,
  status text not null default 'queued',
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  locked_at timestamptz,
  locked_by text,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_message_jobs_body_hash_key unique (body_hash),
  constraint ai_message_jobs_status_check check (
    status in ('queued', 'processing', 'retrying', 'sent', 'failed')
  )
);

alter table public.ai_message_jobs
  add column if not exists source text not null default 'messenger_webhook',
  add column if not exists body_hash text,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists status text not null default 'queued',
  add column if not exists attempts integer not null default 0,
  add column if not exists max_attempts integer not null default 5,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists last_error text,
  add column if not exists processed_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.ai_message_jobs
set
  source = coalesce(source, 'messenger_webhook'),
  body_hash = coalesce(body_hash, encode(digest(id::text, 'sha256'), 'hex')),
  payload = coalesce(payload, '{}'::jsonb),
  status = coalesce(status, 'queued'),
  attempts = coalesce(attempts, 0),
  max_attempts = coalesce(max_attempts, 5),
  next_attempt_at = coalesce(next_attempt_at, now()),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.ai_message_jobs
  alter column source set default 'messenger_webhook',
  alter column source set not null,
  alter column body_hash set not null,
  alter column payload set default '{}'::jsonb,
  alter column payload set not null,
  alter column status set default 'queued',
  alter column status set not null,
  alter column attempts set default 0,
  alter column attempts set not null,
  alter column max_attempts set default 5,
  alter column max_attempts set not null,
  alter column next_attempt_at set default now(),
  alter column next_attempt_at set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_message_jobs_body_hash_key'
      and conrelid = 'public.ai_message_jobs'::regclass
  ) then
    alter table public.ai_message_jobs
      add constraint ai_message_jobs_body_hash_key unique (body_hash);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_message_jobs_status_check'
      and conrelid = 'public.ai_message_jobs'::regclass
  ) then
    alter table public.ai_message_jobs
      add constraint ai_message_jobs_status_check check (
        status in ('queued', 'processing', 'retrying', 'sent', 'failed')
      );
  end if;
end $$;

create index if not exists ai_message_jobs_ready_idx
  on public.ai_message_jobs (status, next_attempt_at, created_at)
  where status in ('queued', 'retrying');

create index if not exists ai_message_jobs_locked_idx
  on public.ai_message_jobs (locked_at)
  where status = 'processing';

create or replace function public.claim_ai_message_jobs(
  batch_size integer default 5,
  worker_id text default 'worker'
)
returns setof public.ai_message_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_message_jobs
  set
    status = 'retrying',
    locked_at = null,
    locked_by = null,
    next_attempt_at = now(),
    updated_at = now()
  where status = 'processing'
    and locked_at < now() - interval '5 minutes'
    and attempts < max_attempts;

  return query
  with picked as (
    select id
    from public.ai_message_jobs
    where status in ('queued', 'retrying')
      and next_attempt_at <= now()
      and attempts < max_attempts
    order by created_at
    limit greatest(1, least(coalesce(batch_size, 5), 25))
    for update skip locked
  )
  update public.ai_message_jobs job
  set
    status = 'processing',
    attempts = job.attempts + 1,
    locked_at = now(),
    locked_by = coalesce(worker_id, 'worker'),
    updated_at = now()
  from picked
  where job.id = picked.id
  returning job.*;
end;
$$;

alter table public.ai_message_jobs enable row level security;

revoke all on table public.ai_message_jobs from anon, authenticated;
revoke execute on function public.claim_ai_message_jobs(integer, text) from anon, authenticated;
