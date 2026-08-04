import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOB_STATUSES = ["queued", "processing", "retrying", "sent", "failed", "canceled"];

export async function GET(request: Request) {
  const workerSecret = getWorkerSecret();

  if (!workerSecret || !isAuthorizedWorkerRequest(request, workerSecret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [jobs, activeJobs, recentSendFailures] = await Promise.all([
    getJobCounts(),
    getActiveJobs(),
    getRecentSendFailures(),
  ]);

  return Response.json({
    status: "ok",
    checkedAt: new Date().toISOString(),
    env: getQueueEnvSummary(),
    jobs,
    activeJobs,
    recentSendFailures,
  });
}

export async function POST(request: Request) {
  return GET(request);
}

function getWorkerSecret() {
  return process.env.AI_WORKER_SECRET?.trim() || process.env.CRON_SECRET?.trim() || "";
}

function isAuthorizedWorkerRequest(request: Request, workerSecret: string) {
  const providedSecret =
    request.headers.get("x-ai-worker-secret") ||
    getBearerToken(request.headers.get("authorization") ?? "");

  return providedSecret === workerSecret;
}

function getBearerToken(value: string) {
  return value.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

function getQueueEnvSummary() {
  const siteUrl = process.env.AI_SITE_URL?.trim() || "";

  return {
    aiQueueEnabled: process.env.AI_QUEUE_ENABLED !== "false",
    hasWorkerSecret: Boolean(getWorkerSecret()),
    aiSiteUrlHost: getSafeHost(siteUrl),
    aiSiteUrlLooksLocal: /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i.test(siteUrl),
    aiMessageJobBatchSize: process.env.AI_MESSAGE_JOB_BATCH_SIZE || "",
    aiMessageJobConcurrency: process.env.AI_MESSAGE_JOB_CONCURRENCY || "",
    aiMessageJobMaxRounds: process.env.AI_MESSAGE_JOB_MAX_ROUNDS || "",
    aiRequestTimeoutMs: process.env.AI_REQUEST_TIMEOUT_MS || "",
    aiWorkerWebhookTimeoutMs: process.env.AI_WORKER_WEBHOOK_TIMEOUT_MS || "",
  };
}

function getSafeHost(value: string) {
  if (!value) {
    return "";
  }

  try {
    return new URL(value).host;
  } catch {
    return "invalid-url";
  }
}

async function getJobCounts() {
  const entries = await Promise.all(
    JOB_STATUSES.map(async (status) => {
      const { count, error } = await supabaseAdmin
        .from("ai_message_jobs")
        .select("*", { count: "exact", head: true })
        .eq("status", status);

      return [status, error ? `ERR: ${error.message}` : count ?? 0] as const;
    })
  );

  return Object.fromEntries(entries);
}

async function getActiveJobs() {
  const { data, error } = await supabaseAdmin
    .from("ai_message_jobs")
    .select("id,status,attempts,max_attempts,locked_at,next_attempt_at,last_error,created_at,updated_at")
    .in("status", ["queued", "processing", "retrying", "failed"])
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    return { error: error.message };
  }

  return data ?? [];
}

async function getRecentSendFailures() {
  const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("rate_limit_logs")
    .select("client_id,page_id,recipient_id,message_type,status_code,error_code,error_subcode,error_message,created_at")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return { error: error.message };
  }

  return data ?? [];
}
