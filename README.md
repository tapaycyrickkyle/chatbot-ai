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
