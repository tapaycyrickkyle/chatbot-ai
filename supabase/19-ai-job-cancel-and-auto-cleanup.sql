-- Allow pending jobs to be canceled when the Page owner manually replies,
-- and add RPC cleanup for terminal AI message jobs.

alter table public.ai_message_jobs
  drop constraint if exists ai_message_jobs_status_check;

alter table public.ai_message_jobs
  add constraint ai_message_jobs_status_check check (
    status in ('queued', 'processing', 'retrying', 'sent', 'failed', 'canceled')
  );

create index if not exists ai_message_jobs_terminal_processed_at_idx
  on public.ai_message_jobs (status, processed_at)
  where status in ('sent', 'failed', 'canceled');

create or replace function public.cancel_pending_ai_message_jobs(
  target_page_id text,
  target_recipient_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  canceled_count integer := 0;
begin
  update public.ai_message_jobs job
  set
    status = 'canceled',
    locked_at = null,
    locked_by = null,
    last_error = 'Canceled because the Page owner manually replied.',
    processed_at = now(),
    updated_at = now()
  where job.status in ('queued', 'retrying')
    and exists (
      select 1
      from jsonb_array_elements(coalesce(job.payload->'entry', '[]'::jsonb)) entry
      cross join jsonb_array_elements(coalesce(entry->'messaging', '[]'::jsonb)) messaging
      where entry->>'id' = target_page_id
        and messaging->'sender'->>'id' = target_recipient_id
        and messaging->'message'->>'text' is not null
        and coalesce((messaging->'message'->>'is_echo')::boolean, false) = false
    );

  get diagnostics canceled_count = row_count;

  return canceled_count;
end;
$$;

create or replace function public.cleanup_ai_message_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  delete from public.ai_message_jobs
  where (
      status in ('sent', 'canceled')
      and processed_at < now() - interval '1 day'
    )
    or (
      status = 'failed'
      and updated_at < now() - interval '7 days'
    );

  get diagnostics deleted_count = row_count;

  return deleted_count;
end;
$$;

revoke execute on function public.cancel_pending_ai_message_jobs(text, text) from anon, authenticated;
revoke execute on function public.cleanup_ai_message_jobs() from anon, authenticated;
