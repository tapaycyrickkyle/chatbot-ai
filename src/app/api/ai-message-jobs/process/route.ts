import {
  claimAiMessageJobs,
  completeAiMessageJob,
  failAiMessageJob,
} from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 25;
const DEFAULT_WEBHOOK_PROCESS_TIMEOUT_MS = 120000;

export async function POST(request: Request) {
  const workerSecret = getWorkerSecret();

  if (!workerSecret || !isAuthorizedWorkerRequest(request, workerSecret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workerId = `ai-worker-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const batchSize = getBatchSize(request);
  const jobs = await claimAiMessageJobs({ batchSize, workerId });
  const results: Array<{
    id: string;
    status: "sent" | "failed";
    error?: string;
  }> = [];

  for (const job of jobs) {
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
      results.push({ id: job.id, status: "sent" });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      await failAiMessageJob({
        jobId: job.id,
        errorMessage,
        attempts: job.attempts,
        maxAttempts: job.max_attempts,
      });
      results.push({ id: job.id, status: "failed", error: errorMessage });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return Response.json({
    status: "ok",
    claimed: jobs.length,
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

function getWebhookProcessTimeoutMs() {
  const configuredValue = Number(process.env.AI_WORKER_WEBHOOK_TIMEOUT_MS);

  if (Number.isFinite(configuredValue) && configuredValue >= 30000 && configuredValue <= 300000) {
    return Math.floor(configuredValue);
  }

  return DEFAULT_WEBHOOK_PROCESS_TIMEOUT_MS;
}
