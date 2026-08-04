import { waitUntil } from "@vercel/functions";
import {
  claimAiMessageJobs,
  completeAiMessageJob,
  failAiMessageJob,
} from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 25;
const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 15;
const DEFAULT_MAX_ROUNDS = 3;
const MAX_ROUNDS = 10;
const DEFAULT_WEBHOOK_PROCESS_TIMEOUT_MS = 120000;

type AiMessageJob = Awaited<ReturnType<typeof claimAiMessageJobs>>[number];
type WorkerResult = {
  id: string;
  status: "sent" | "failed";
  error?: string;
};

export async function POST(request: Request) {
  const workerSecret = getWorkerSecret();

  if (!workerSecret || !isAuthorizedWorkerRequest(request, workerSecret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workerId = `ai-worker-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const batchSize = getBatchSize(request);
  const maxRounds = getMaxRounds(request);
  const results: WorkerResult[] = [];
  let claimed = 0;
  let rounds = 0;
  let shouldContinue = false;

  for (rounds = 0; rounds < maxRounds; rounds += 1) {
    const jobs = await claimAiMessageJobs({ batchSize, workerId });

    if (jobs.length === 0) {
      shouldContinue = false;
      break;
    }

    claimed += jobs.length;
    results.push(...(await processJobsByConversation(jobs, request, workerSecret)));
    shouldContinue = jobs.length >= batchSize;
  }

  if (shouldContinue) {
    triggerFollowUpWorker(request, workerSecret, batchSize);
  }

  return Response.json({
    status: "ok",
    claimed,
    rounds,
    results,
  });
}

export async function GET(request: Request) {
  return POST(request);
}

function isAuthorizedWorkerRequest(request: Request, workerSecret: string) {
  const providedSecret =
    request.headers.get("x-ai-worker-secret") ||
    getBearerToken(request.headers.get("authorization") ?? "");

  return providedSecret === workerSecret;
}

function getWorkerSecret() {
  return process.env.AI_WORKER_SECRET?.trim() || process.env.CRON_SECRET?.trim() || "";
}

function getBearerToken(value: string) {
  return value.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

function getBatchSize(request: Request) {
  const requestedBatchSize = Number(new URL(request.url).searchParams.get("batchSize"));

  if (
    Number.isFinite(requestedBatchSize) &&
    requestedBatchSize >= 1 &&
    requestedBatchSize <= MAX_BATCH_SIZE
  ) {
    return Math.floor(requestedBatchSize);
  }

  const configuredValue = Number(process.env.AI_MESSAGE_JOB_BATCH_SIZE);

  if (
    Number.isFinite(configuredValue) &&
    configuredValue >= 1 &&
    configuredValue <= MAX_BATCH_SIZE
  ) {
    return Math.floor(configuredValue);
  }

  return DEFAULT_BATCH_SIZE;
}

async function processJobsByConversation(
  jobs: AiMessageJob[],
  request: Request,
  workerSecret: string
) {
  const groups = Array.from(groupJobsByConversation(jobs).values());
  const results: WorkerResult[] = [];
  let nextGroupIndex = 0;

  async function runNextGroup() {
    while (nextGroupIndex < groups.length) {
      const group = groups[nextGroupIndex];
      nextGroupIndex += 1;

      for (const job of group) {
        results.push(await processJob(job, request, workerSecret));
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(getConcurrency(), groups.length) }, () => runNextGroup())
  );

  return results;
}

function groupJobsByConversation(jobs: AiMessageJob[]) {
  const groups = new Map<string, AiMessageJob[]>();

  for (const job of jobs) {
    const key = getJobConversationKey(job);
    const group = groups.get(key) ?? [];
    group.push(job);
    groups.set(key, group);
  }

  return groups;
}

function getJobConversationKey(job: AiMessageJob) {
  const payload = job.payload as {
    entry?: Array<{
      id?: string;
      messaging?: Array<{
        sender?: { id?: string };
        recipient?: { id?: string };
        message?: { is_echo?: boolean };
      }>;
    }>;
  };
  const entry = payload.entry?.[0];
  const event = entry?.messaging?.[0];
  const pageId = entry?.id || "unknown-page";
  const recipientId =
    event?.message?.is_echo && event.recipient?.id
      ? event.recipient.id
      : event?.sender?.id || `job:${job.id}`;

  return `${pageId}:${recipientId}`;
}

async function processJob(
  job: AiMessageJob,
  request: Request,
  workerSecret: string
): Promise<WorkerResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), getWebhookProcessTimeoutMs());

  try {
    const response = await fetch(new URL("/api/webhook", request.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ai-worker-secret": workerSecret,
      },
      signal: controller.signal,
      body: JSON.stringify(job.payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");

      throw new Error(
        `Webhook worker processing failed with ${response.status}: ${errorText.slice(0, 300)}`
      );
    }

    await completeAiMessageJob(job.id);
    return { id: job.id, status: "sent" };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await failAiMessageJob({
      jobId: job.id,
      errorMessage,
      attempts: job.attempts,
      maxAttempts: job.max_attempts,
    });
    return { id: job.id, status: "failed", error: errorMessage };
  } finally {
    clearTimeout(timeoutId);
  }
}

function getConcurrency() {
  const configuredValue = Number(process.env.AI_MESSAGE_JOB_CONCURRENCY);

  if (
    Number.isFinite(configuredValue) &&
    configuredValue >= 1 &&
    configuredValue <= MAX_CONCURRENCY
  ) {
    return Math.floor(configuredValue);
  }

  return DEFAULT_CONCURRENCY;
}

function getMaxRounds(request: Request) {
  const requestedRounds = Number(new URL(request.url).searchParams.get("maxRounds"));

  if (Number.isFinite(requestedRounds) && requestedRounds >= 1 && requestedRounds <= MAX_ROUNDS) {
    return Math.floor(requestedRounds);
  }

  const configuredValue = Number(process.env.AI_MESSAGE_JOB_MAX_ROUNDS);

  if (Number.isFinite(configuredValue) && configuredValue >= 1 && configuredValue <= MAX_ROUNDS) {
    return Math.floor(configuredValue);
  }

  return DEFAULT_MAX_ROUNDS;
}

function triggerFollowUpWorker(request: Request, workerSecret: string, batchSize: number) {
  const followUpPromise = fetch(
    new URL(`/api/ai-message-jobs/process?batchSize=${batchSize}`, request.url),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ai-worker-secret": workerSecret,
      },
    }
  ).catch((error) => {
    console.warn("AI message job follow-up worker failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  waitUntil(followUpPromise);
}

function getWebhookProcessTimeoutMs() {
  const configuredValue = Number(process.env.AI_WORKER_WEBHOOK_TIMEOUT_MS);

  if (Number.isFinite(configuredValue) && configuredValue >= 30000 && configuredValue <= 300000) {
    return Math.floor(configuredValue);
  }

  return DEFAULT_WEBHOOK_PROCESS_TIMEOUT_MS;
}
