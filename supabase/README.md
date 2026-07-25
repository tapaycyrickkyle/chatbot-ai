# Supabase Schema

For the current Messenger-only AI chatbot, run this single file in Supabase SQL Editor:

1. `00-run-all.sql`

That file creates/updates the current app tables, applies the RLS lockdown, and removes legacy tables from old FAQ/flow, Facebook comment private-reply, and owner-portal features.

If you prefer running files individually, run them in this order:

1. `01-core-schema.sql`
2. `02-remove-legacy-flow.sql`
3. `03-logging-maintenance.sql`
4. `04-ai-conversations.sql`
5. `07-rls-lockdown.sql`
6. `08-remove-comment-private-replies.sql`
7. `10-google-sheets-tab-name.sql`
8. `11-ai-last-reply-memory.sql`
9. `12-ai-memory-and-persona.sql`
10. `13-welcome-sequence.sql`
11. `14-timed-ai-pause.sql`
12. `15-auto-reply-ignore-pattern.sql`
13. `16-remove-owner-portal-tables.sql`
14. `17-ai-message-jobs.sql`
15. `18-ai-retention-cleanup.sql`
16. `19-ai-job-cancel-and-auto-cleanup.sql`
17. `21-messenger-message-dedupe.sql`

## Tables Used

- `clients`: connected Facebook Pages, page tokens, page-level AI on/off state, business prompt knowledge, AI character/tone, welcome sequence settings, and per-page auto-reply echo ignore pattern.
- `rate_limit_logs`: Messenger send failures, usage snapshots, and cleanup logs.
- `ai_conversations`: customer-level AI pause/resume state, compact memory, customer state, and recent short turns.
- `ai_message_jobs`: queued Messenger webhook deliveries for async AI processing.
- `processed_messenger_messages`: Messenger message IDs already claimed by the webhook, used to prevent duplicate replies.

## No Longer Used

- `faqs`: removed because the website is Full AI only.
- `bot_flow_reply_sessions`: removed with the legacy FAQ/flow system.
- `replied_comments`: removed because the app no longer auto-sends private replies to people who comment on Facebook Page posts.
- `business_users`: owner login mapping from the removed owner portal.
- `orders`: order records from the removed owner portal.

## Security Model

The app uses Next.js API routes plus `SUPABASE_SERVICE_ROLE_KEY` for server-side database work. The browser uses the Supabase publishable key only for Auth sign-in/sign-out.

`07-rls-lockdown.sql` enables RLS and revokes direct table access from `anon` and `authenticated`, so database access goes through the app's protected API routes.

## Admin Access

Admin users are controlled only by `SUPABASE_ADMIN_EMAILS`.
