# Supabase Schema

For the current Messenger-only AI chatbot, run this single file in Supabase SQL Editor:

1. `00-run-all.sql`

That file creates/updates the current app tables, applies the RLS lockdown, and removes legacy tables from old FAQ/flow and Facebook comment private-reply features.

If you prefer running files individually, run them in this order:

1. `01-core-schema.sql`
2. `02-remove-legacy-flow.sql`
3. `03-logging-maintenance.sql`
4. `04-ai-conversations.sql`
5. `05-business-users.sql`
6. `06-orders.sql`
7. `07-rls-lockdown.sql`
8. `08-remove-comment-private-replies.sql`

## Tables Used

- `clients`: connected Facebook Pages, page tokens, page-level AI on/off state, business prompt knowledge, and lead capture settings.
- `rate_limit_logs`: Messenger send failures, usage snapshots, and cleanup logs.
- `ai_conversations`: customer-level AI pause/resume state for owner handoff.
- `business_users`: business-owner email allowlist mapped to one client.
- `orders`: order records for the business-owner order page.

## No Longer Used

- `faqs`: removed because the website is Full AI only.
- `bot_flow_reply_sessions`: removed with the legacy FAQ/flow system.
- `replied_comments`: removed because the app no longer auto-sends private replies to people who comment on Facebook Page posts.

## Security Model

The app uses Next.js API routes plus `SUPABASE_SERVICE_ROLE_KEY` for server-side database work. The browser uses the Supabase publishable key only for Auth sign-in/sign-out.

`07-rls-lockdown.sql` enables RLS and revokes direct table access from `anon` and `authenticated`, so database access goes through the app's protected API routes.

## Add A Business Owner

After creating the user in Supabase Auth, copy/edit/run:

- `09-add-business-owner-template.sql`
