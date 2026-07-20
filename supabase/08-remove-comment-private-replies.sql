-- Comment private replies are no longer part of the Messenger-only AI chatbot.
-- Run this after the core setup if an older database still has this table.

drop table if exists public.replied_comments;
