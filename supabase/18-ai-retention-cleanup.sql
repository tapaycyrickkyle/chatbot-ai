-- Indexes for storage retention cleanup:
-- - sent/canceled AI message jobs older than 1 day
-- - failed AI message jobs older than 7 days
-- - inactive AI conversations older than 7 days

create index if not exists ai_message_jobs_sent_processed_at_idx
  on public.ai_message_jobs (processed_at)
  where status = 'sent';

create index if not exists ai_message_jobs_terminal_processed_at_idx
  on public.ai_message_jobs (status, processed_at)
  where status in ('sent', 'failed', 'canceled');

create index if not exists ai_conversations_last_message_at_idx
  on public.ai_conversations (last_message_at);
