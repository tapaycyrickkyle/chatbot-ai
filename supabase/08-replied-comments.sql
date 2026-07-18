-- Page comment private-reply dedupe.
-- Used by the Page feed webhook so the app sends only one private reply per comment.

create table if not exists public.replied_comments (
  id uuid primary key default gen_random_uuid(),
  client_id integer not null references public.clients(id) on delete cascade,
  page_id text not null,
  comment_id text not null,
  post_id text,
  from_id text,
  message text,
  reply_message text not null default 'Hi! I sent you the details here. How can I help?',
  created_at timestamptz not null default now(),
  constraint replied_comments_comment_id_key unique (comment_id)
);

alter table public.replied_comments
  add column if not exists client_id integer;

alter table public.replied_comments
  add column if not exists page_id text not null default '';

alter table public.replied_comments
  add column if not exists comment_id text not null default '';

alter table public.replied_comments
  add column if not exists post_id text;

alter table public.replied_comments
  add column if not exists from_id text;

alter table public.replied_comments
  add column if not exists message text;

alter table public.replied_comments
  add column if not exists reply_message text not null default 'Hi! I sent you the details here. How can I help?';

alter table public.replied_comments
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'replied_comments_comment_id_key'
      and conrelid = 'public.replied_comments'::regclass
  ) then
    alter table public.replied_comments
      add constraint replied_comments_comment_id_key unique (comment_id);
  end if;
end $$;

create index if not exists replied_comments_client_created_at_idx
  on public.replied_comments (client_id, created_at desc);

create index if not exists replied_comments_page_created_at_idx
  on public.replied_comments (page_id, created_at desc);

alter table public.replied_comments enable row level security;

revoke all on table public.replied_comments from anon, authenticated;
