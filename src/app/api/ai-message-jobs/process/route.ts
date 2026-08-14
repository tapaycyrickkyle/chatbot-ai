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
type MessengerWebhookPayload = {
  entry?: Array<{
    id?: string;
    messaging?: Array<{
      sender?: { id?: string };
      message?: { text?: string; is_echo?: boolean };
    }>;
  }>;
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

      const combinedPayload = getCombinedCustomerTextPayload(group);
      if (combinedPayload) {
        results.push(...(await processJobGroup(group, combinedPayload, request, workerSecret)));
        continue;
      }

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

function getCombinedCustomerTextPayload(jobs: AiMessageJob[]): MessengerWebhookPayload | null {
  if (jobs.length < 2) return null;

  const messages = jobs.map((job) => {
    const payload = job.payload as MessengerWebhookPayload;
    const entry = payload.entry?.[0];
    const event = entry?.messaging?.[0];
    const text = event?.message?.text?.trim();
    const senderId = event?.sender?.id;

    if (
      payload.entry?.length !== 1 ||
      entry?.messaging?.length !== 1 ||
      !senderId ||
      !text ||
      event?.message?.is_echo
    ) {
      return null;
    }

    return { pageId: entry.id ?? "", senderId, text };
  });

  if (messages.some((message) => !message)) return null;
  const customerMessages = messages as Array<{ pageId: string; senderId: string; text: string }>;
  const firstMessage = customerMessages[0];
  if (customerMessages.some((message) => message.pageId !== firstMessage.pageId || message.senderId !== firstMessage.senderId)) {
    return null;
  }

  const payload = JSON.parse(JSON.stringify(jobs[jobs.length - 1].payload)) as MessengerWebhookPayload;
  const message = payload.entry?.[0]?.messaging?.[0]?.message;
  if (!message) return null;
  message.text = customerMessages.map((customerMessage) => customerMessage.text).join("\n");
  return payload;
}

async function processJobGroup(
  jobs: AiMessageJob[],
  payload: MessengerWebhookPayload,
  request: Request,
  workerSecret: string
) {
  const primaryJob = { ...jobs[jobs.length - 1], payload };
  const primaryResult = await processJob(primaryJob, request, workerSecret);

  if (primaryResult.status === "sent") {
    await Promise.all(jobs.slice(0, -1).map((job) => completeAiMessageJob(job.id)));
    return jobs.map((job) => ({ id: job.id, status: "sent" as const }));
  }

  await Promise.all(jobs.slice(0, -1).map((job) => failAiMessageJob({
    jobId: job.id,
    errorMessage: primaryResult.error ?? "Grouped webhook processing failed",
    attempts: job.attempts,
    maxAttempts: job.max_attempts,
  })));
  return jobs.map((job) => ({ id: job.id, status: "failed" as const, error: primaryResult.error }));
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
