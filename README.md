This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## AI Provider

The chatbot uses an OpenAI-compatible chat completions API. Configure it with environment variables:

```env
AI_API_URL="provider chat completions URL"
AI_API_KEY="provider API key"
AI_MODEL="provider model name"
AI_SITE_URL="http://localhost:3000"
AI_APP_NAME="AI Inbox"
```

OpenRouter example:

```env
AI_API_URL="https://openrouter.ai/api/v1/chat/completions"
AI_API_KEY="sk-or-v1-your-openrouter-key"
AI_MODEL="google/gemma-4-26b-a4b-it:free"
AI_SITE_URL="http://localhost:3000"
AI_APP_NAME="AI Inbox"
```

To switch models, change `AI_MODEL`. To switch providers, change `AI_API_URL` and `AI_API_KEY`.

DeepSeek example:

```env
AI_API_URL="https://api.deepseek.com/chat/completions"
AI_API_KEY="sk-your-deepseek-key"
AI_MODEL="deepseek-chat"
```

## AI Message Queue

For higher Messenger traffic, configure the webhook to queue deliveries and process them through a worker:

```env
AI_WORKER_SECRET="long-random-secret"
AI_QUEUE_ENABLED="true"
AI_MESSAGE_JOB_BATCH_SIZE="5"
AI_MESSAGE_JOB_CONCURRENCY="5"
AI_MESSAGE_JOB_MAX_ROUNDS="3"
AI_REQUEST_TIMEOUT_MS="20000"
AI_WORKER_WEBHOOK_TIMEOUT_MS="120000"
```

Run `supabase/17-ai-message-jobs.sql` and `supabase/19-ai-job-cancel-and-auto-cleanup.sql` in Supabase. The webhook will self-kick the worker after queueing each delivery. For a free backup, add these GitHub Actions repository secrets:

```text
AI_WORKER_URL=https://your-vercel-domain.com/api/ai-message-jobs/process
AI_MAINTENANCE_URL=https://your-vercel-domain.com/api/maintenance/storage-cleanup
AI_WORKER_SECRET=long-random-secret
```

The workflow in `.github/workflows/process-ai-message-jobs.yml` calls the worker every 5 minutes to rescue any jobs that were not handled by the self-kick.

If `AI_WORKER_SECRET` or `CRON_SECRET` is missing, the webhook falls back to inline processing so messages are not trapped in the queue.

To verify production queue config and stuck jobs without exposing secrets:

```bash
curl --fail --request POST "https://your-vercel-domain.com/api/ai-message-jobs/health" \
  --header "Authorization: Bearer $AI_WORKER_SECRET"
```

## Storage Retention

The admin storage cleanup endpoint keeps database usage low:

```text
rate_limit_logs: delete rows older than 7 days
ai_message_jobs: delete sent jobs older than 1 day
ai_conversations: delete inactive conversation memory older than 7 days
welcome_sequence_recipients: kept indefinitely so welcome status does not reset
processed_messenger_messages: delete dedupe keys older than 7 days
```

Run `supabase/18-ai-retention-cleanup.sql`, `supabase/19-ai-job-cancel-and-auto-cleanup.sql`, `supabase/21-messenger-message-dedupe.sql`, and `supabase/22-welcome-sequence-recipients.sql` in Supabase to add cleanup indexes/functions, Messenger message dedupe, and permanent welcome status.

GitHub Actions calls `/api/maintenance/storage-cleanup` once daily using `AI_MAINTENANCE_URL` and `AI_WORKER_SECRET`, so retention cleanup runs automatically after deployment.

## Customer Information

The AI is configured to keep helping with the latest customer message instead of asking for customer information forms. Customer-provided details remain part of the Messenger conversation history used to operate the AI workflow.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
