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
18. `22-welcome-sequence-recipients.sql`
19. `23-remove-ai-character-tone.sql`
20. `24-confirmed-lead-capture.sql`

## Tables Used

- `clients`: connected Facebook Pages, page tokens, page-level AI on/off state, business prompt knowledge, welcome sequence settings, and per-page auto-reply echo ignore pattern.
- `rate_limit_logs`: Messenger send failures, usage snapshots, and cleanup logs.
- `ai_conversations`: customer-level AI pause/resume state, compact memory, customer state, and recent short turns.
- `welcome_sequence_recipients`: permanent minimal record of customers who already received the welcome sequence.
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

## Confirmed Google Sheets Leads

Run `24-confirmed-lead-capture.sql` for an existing database (or run the updated
`00-run-all.sql` for a fresh setup). In Page Settings, enable Confirmed Lead
Capture, add each `label|type` field, and mark an optional one as
`label|type|optional`, then enter the Google Apps Script
Web App `/exec` URL plus sheet tab name. Copy the script in
`google-apps-script-lead-webhook.js` to Apps Script, deploy it as a Web App with
access set to anyone, and paste its deployment URL into Page Settings.

Use **When should the AI ask for lead details?** in the Page's Prompt Builder to
set the lead trigger for that Page. For example, “when the customer asks for a
quote, discount, or to place an order.” Leaving it blank keeps the standard
ready-to-buy, booking, or human-contact trigger.

The app creates a Google Sheet row only after the customer confirms the summary.
Drafts and delivery attempts are stored for 30 days so a temporary Apps Script
failure can be retried without asking the customer for their details again.
The first lead-sheet column is **Date Sent**, automatically formatted like
`August 14, 2026` when a completed lead is delivered. The remaining columns use
the configured lead-field headers. The same deployed Apps Script works for later
field changes: it adds missing header columns and maps each lead value by its
configured field label.
Configured phone fields are stored as text, preserving leading zeroes.
