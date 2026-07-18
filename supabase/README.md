# Supabase Schema

For a new setup, you can run the single combined file:

1. `00-run-all.sql`

Or run the SQL files individually in order:

1. `01-core-schema.sql`
2. `02-legacy-flow-support.sql`
3. `03-logging-maintenance.sql`
4. `04-ai-conversations.sql`
5. `05-business-users.sql`
6. `06-orders.sql`
7. `07-rls-lockdown.sql`
8. `08-replied-comments.sql`

## Audit Notes

The app currently uses these tables:

- `clients`: connected Facebook Pages, page tokens, Full AI mode, and business prompt knowledge.
- `faqs`: legacy flow-builder cards. The UI is Full AI only now, but some legacy/debug APIs still read this table.
- `bot_flow_reply_sessions`: legacy flow reply-capture sessions. Cleanup/debug code still references it.
- `rate_limit_logs`: webhook send failures, usage snapshots, and cleanup logs.
- `ai_conversations`: customer-level AI pause/resume state for owner handoff.
- `business_users`: business-owner email allowlist mapped to one client.
- `orders`: order records for the business-owner order page.
- `replied_comments`: Page comment IDs already answered by the private-reply webhook.

`clients.id` is an integer in the existing project database, so related tables use `integer` foreign keys.

## Security Model

The app uses Next.js API routes plus `SUPABASE_SERVICE_ROLE_KEY` for server-side database work. The browser uses the Supabase publishable key only for Auth sign-in/sign-out.

`07-rls-lockdown.sql` enables RLS and revokes direct table access from `anon` and `authenticated`, so database access goes through the app's protected API routes.

## Add A Business Owner

After creating the user in Supabase Auth, copy/edit/run:

- `09-add-business-owner-template.sql`
