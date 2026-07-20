import type { NextApiRequest, NextApiResponse } from "next";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  getAiConversation,
  getClients,
  pauseAiConversation,
  recordCustomerConversationMessage,
} from "@/lib/database";
import { askAi } from "@/lib/ai-chat";
import { sendLeadToGoogleSheet } from "@/lib/google-sheets";
import { extractLeadFromMessage } from "@/lib/lead-capture";
import { supabaseAdmin } from "@/lib/supabase";

export const config = {
  api: {
    bodyParser: false,
  },
};

const GRAPH_API_BASE_URL = "https://graph.facebook.com/v20.0";
const GRAPH_API_MESSAGES_URL = `${GRAPH_API_BASE_URL}/me/messages`;
const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;
const MAX_SEND_RETRIES = 5;
const HIGH_USAGE_THRESHOLD = 80;
const HIGH_USAGE_DELAY_MS = 1500;
const REQUEST_TIMEOUT_MS = 15000;
const GET_STARTED_PAYLOAD = "GET_STARTED";

type WebhookBody = {
  object?: string;
  entry?: Array<{
    id: string;
    changes?: unknown[];
    messaging?: Array<{
      sender: { id: string };
      recipient?: { id?: string };
      message?: {
        text?: string;
        is_echo?: boolean;
        app_id?: string | number;
      };
      postback?: {
        payload?: string;
      };
    }>;
  }>;
};

type MessengerRequestBody = {
  recipient: { id: string };
  message: unknown;
};

type UsageMetrics = {
  call_count?: number;
  total_cputime?: number;
  total_time?: number;
};

type UsageSummary = {
  appUsage: UsageMetrics | null;
  pageUsage: UsageMetrics | null;
  appUsageRaw: string;
  pageUsageRaw: string;
  highestCallCount: number;
};

type MessengerApiError = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

type MessengerApiErrorPayload = {
  error?: MessengerApiError;
};

type SafeSendContext = {
  clientId: string;
  pageId: string;
  recipientId: string;
  messageType: "text";
};

function summarizeWebhookEvent(
  event: NonNullable<NonNullable<WebhookBody["entry"]>[number]["messaging"]>[number]
) {
  return {
    hasText: Boolean(event.message?.text),
    hasPostback: Boolean(event.postback?.payload),
  };
}

function getConversationRecipientId(
  event: NonNullable<NonNullable<WebhookBody["entry"]>[number]["messaging"]>[number]
) {
  if (event.message?.is_echo && event.recipient?.id) {
    return event.recipient.id;
  }

  return event.sender.id;
}

function isOwnerMessageEcho(
  event: NonNullable<NonNullable<WebhookBody["entry"]>[number]["messaging"]>[number],
  pageId: string
) {
  if (!event.message?.is_echo || event.sender.id !== pageId || !event.recipient?.id) {
    return false;
  }

  const appId = event.message.app_id ? String(event.message.app_id) : "";
  const facebookAppId = process.env.FACEBOOK_APP_ID?.trim() || "";

  if (appId && facebookAppId && appId === facebookAppId) {
    return false;
  }

  return !appId;
}

async function safelyPauseAiForOwnerReply(input: {
  clientId: string;
  pageId: string;
  recipientId: string;
}) {
  try {
    await pauseAiConversation({
      clientId: input.clientId,
      pageId: input.pageId,
      recipientId: input.recipientId,
      pausedBy: "owner",
    });
  } catch (error) {
    console.warn("Failed to pause AI after owner reply", error);
  }
}

async function safelyRecordCustomerMessage(input: {
  clientId: string;
  pageId: string;
  recipientId: string;
  message: string;
}) {
  try {
    await recordCustomerConversationMessage(input);
  } catch (error) {
    console.warn("Failed to record customer conversation", error);
  }
}

async function safelyIsAiPaused(clientId: string, recipientId: string) {
  try {
    const conversation = await getAiConversation(clientId, recipientId);

    return Boolean(conversation?.ai_paused);
  } catch (error) {
    console.warn("Failed to load AI conversation pause state", error);
    return false;
  }
}

async function safelyCaptureLead(input: {
  clientName: string;
  pageId: string;
  recipientId: string;
  message: string;
  googleSheetsWebhookUrl: string;
}) {
  const lead = extractLeadFromMessage(input.message);

  if (!lead) {
    return;
  }

  try {
    await sendLeadToGoogleSheet({
      fullName: lead.fullName,
      phone: lead.phone,
      pageId: input.pageId,
      pageName: input.clientName,
      recipientId: input.recipientId,
      message: input.message,
      capturedAt: new Date().toISOString(),
    }, { webhookUrl: input.googleSheetsWebhookUrl });
  } catch (error) {
    console.warn("Failed to send lead to Google Sheet", error);
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }

    return res.status(403).send("Verification failed");
  }

  if (req.method === "POST") {
    let rawBody = "";

    try {
      rawBody = await readRawBody(req);
    } catch (error) {
      if (error instanceof Error && error.message === "Webhook body too large") {
        return res.status(413).json({ error: "Payload too large" });
      }

      console.error("Failed to read webhook body", error);
      return res.status(400).json({ error: "Invalid request body" });
    }

    const signature = req.headers["x-hub-signature-256"];

    if (!isValidWebhookSignature(rawBody, signature)) {
      return res.status(403).json({ error: "Invalid signature" });
    }

    let body: WebhookBody;

    try {
      body = JSON.parse(rawBody) as WebhookBody;
    } catch (error) {
      console.error("Invalid webhook JSON payload", error);
      return res.status(400).json({ error: "Invalid JSON payload" });
    }

    if (body.object === "page") {
      const clients = await getClients();

      for (const entry of body.entry ?? []) {
        const pageId = entry.id;
        const client = clients.find((row) => row.page_id === pageId);

        if (!client) {
          continue;
        }

        const pageAccessToken = client.page_access_token;

        for (const event of entry.messaging ?? []) {
          const userId = getConversationRecipientId(event);
          const rawText = event.message?.text;
          const postbackPayload = event.postback?.payload;

          if (isOwnerMessageEcho(event, pageId)) {
            await safelyPauseAiForOwnerReply({
              clientId: client.id,
              pageId,
              recipientId: userId,
            });
            continue;
          }

          if (event.message?.is_echo) {
            console.info("AI webhook ignored Page message echo", {
              clientId: client.id,
              pageId,
              userId,
              appId: event.message.app_id ? String(event.message.app_id) : "",
            });
            continue;
          }

          console.info("AI webhook event received", {
            clientId: client.id,
            clientName: client.client_name,
            pageId,
            userId,
            botType: client.bot_type,
            hasBusinessInfo: Boolean(client.business_info?.trim()),
            ...summarizeWebhookEvent(event),
          });

          if (rawText) {
            await safelyRecordCustomerMessage({
              clientId: client.id,
              pageId,
              recipientId: userId,
              message: rawText,
            });
            await safelyCaptureLead({
              clientName: client.client_name,
              pageId,
              recipientId: userId,
              message: rawText,
              googleSheetsWebhookUrl: client.google_sheets_webhook_url,
            });
          }

          if (!client.ai_enabled) {
            console.info("AI webhook skipped disabled page", {
              clientId: client.id,
              pageId,
              userId,
            });
            continue;
          }

          if (await safelyIsAiPaused(client.id, userId)) {
            console.info("AI webhook skipped paused conversation", {
              clientId: client.id,
              pageId,
              userId,
            });
            continue;
          }

          if (rawText) {
            await safelyHandleFlowSend(
              async () => {
                console.info("AI webhook processing text message", {
                  clientId: client.id,
                  pageId,
                  userId,
                  preview: rawText.slice(0, 120),
                });
                const aiReply = await askAi(rawText, client.business_info || "");
                console.info("AI webhook generated reply", {
                  clientId: client.id,
                  pageId,
                  userId,
                  preview: aiReply.slice(0, 120),
                });
                await safeSendMessage(userId, aiReply, pageAccessToken, 0, pageId, client.id);
              },
              { clientId: client.id, pageId, recipientId: userId, messageType: "text" }
            );
            continue;
          }

          if (postbackPayload === GET_STARTED_PAYLOAD) {
            await safelyHandleFlowSend(
              () =>
                safeSendMessage(
                  userId,
                  "Hi! How can I help you today?",
                  pageAccessToken,
                  0,
                  pageId,
                  client.id
                ).then(() => undefined),
              { clientId: client.id, pageId, recipientId: userId, messageType: "text" }
            );
            continue;
          }

          await safelyHandleFlowSend(
            () =>
              safeSendMessage(
                userId,
                "I can help best with text messages right now. Send me your question in a message and I'll reply right away.",
                pageAccessToken,
                0,
                pageId,
                client.id
              ).then(() => undefined),
            { clientId: client.id, pageId, recipientId: userId, messageType: "text" }
          );
        }
      }
    }

    return res.status(200).json({ status: "ok" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

async function safeSendMessage(
  recipientId: string,
  text: string,
  pageToken: string,
  retryCount = 0,
  pageId = "unknown",
  clientId = "unknown"
): Promise<boolean> {
  const url = `${GRAPH_API_MESSAGES_URL}?access_token=${pageToken}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
      }),
    });
    clearTimeout(timeoutId);

    const appUsageRaw = res.headers.get("X-App-Usage") ?? "";
    const pageUsageRaw = res.headers.get("X-Page-Usage") ?? "";

    if (appUsageRaw || pageUsageRaw) {
      const usageSummary = getUsageSummary(res.headers);
      await handleUsageSummary(
        { clientId, pageId, recipientId, messageType: "text" },
        usageSummary
      );
      await logUsageSnapshot({
        clientId,
        pageId,
        recipientId,
        messageType: "text",
        appUsage: appUsageRaw,
        pageUsage: pageUsageRaw,
      });
    }

    const responseText = await res.text().catch(() => "");
    const errorPayload = parseMessengerErrorPayload(responseText);
    const errorCode = errorPayload?.error?.code;
    const isRateLimited = res.status === 429 || errorCode === 4 || errorCode === 32;

    if (isRateLimited) {
      if (retryCount >= MAX_SEND_RETRIES) {
        console.error(`Rate limit retry exhausted for user ${recipientId}`);
        await logSendFailure({
          clientId,
          pageId,
          recipientId,
          messageType: "text",
          statusCode: res.status,
          errorCode,
          errorSubcode: errorPayload?.error?.error_subcode,
          errorMessage: "Rate limit retry exhausted",
          payload: createTextMessageBody(recipientId, text),
        });
        return false;
      }

      const delay = withJitter(Math.pow(2, retryCount) * 1000);
      console.warn(`Rate limited. Retry ${retryCount + 1} in ${delay}ms`);
      await sleep(delay);
      return safeSendMessage(recipientId, text, pageToken, retryCount + 1, pageId, clientId);
    }

    if (!res.ok) {
      const errorData = errorPayload ?? responseText;
      console.error("Send API error:", errorData);
      await logSendFailure({
        clientId,
        pageId,
        recipientId,
        messageType: "text",
        statusCode: res.status,
        errorCode,
        errorSubcode: errorPayload?.error?.error_subcode,
        errorMessage: typeof errorData === "string" ? errorData : JSON.stringify(errorData),
        payload: createTextMessageBody(recipientId, text),
      });
      return false;
    }

    return true;
  } catch (err) {
    clearTimeout(timeoutId);
    console.error("Network error in safeSendMessage:", err);
    await logSendFailure({
      clientId,
      pageId,
      recipientId,
      messageType: "text",
      statusCode: 0,
      errorMessage: err instanceof Error ? err.message : "Unknown network error",
      payload: createTextMessageBody(recipientId, text),
    });
    return false;
  }
}

async function handleUsageSummary(context: SafeSendContext, usageSummary: UsageSummary) {
  if (usageSummary.appUsageRaw) {
    console.warn(`[Messenger Usage] X-App-Usage for page ${context.pageId}: ${usageSummary.appUsageRaw}`);
  }

  if (usageSummary.pageUsageRaw) {
    console.warn(`[Messenger Usage] X-Page-Usage for page ${context.pageId}: ${usageSummary.pageUsageRaw}`);
  }

  if (usageSummary.highestCallCount > HIGH_USAGE_THRESHOLD) {
    console.warn(
      `[Messenger Rate Limit] High usage detected for page ${context.pageId}. Slowing down sends because call_count is at ${usageSummary.highestCallCount}%.`
    );
    await sleep(withJitter(HIGH_USAGE_DELAY_MS));
  }
}

function getUsageSummary(headers: Headers): UsageSummary {
  const appUsageRaw = headers.get("X-App-Usage") ?? "";
  const pageUsageRaw = headers.get("X-Page-Usage") ?? "";
  const appUsage = parseUsageHeader(appUsageRaw);
  const pageUsage = parseUsageHeader(pageUsageRaw);
  const highestCallCount = Math.max(appUsage?.call_count ?? 0, pageUsage?.call_count ?? 0);

  return {
    appUsage,
    pageUsage,
    appUsageRaw,
    pageUsageRaw,
    highestCallCount,
  };
}

function parseUsageHeader(value: string): UsageMetrics | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as UsageMetrics;
    return typeof parsed === "object" && parsed ? parsed : null;
  } catch {
    return null;
  }
}

function parseMessengerErrorPayload(responseText: string) {
  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText) as MessengerApiErrorPayload;
  } catch {
    return null;
  }
}

async function logUsageSnapshot(details: {
  clientId: string;
  pageId: string;
  recipientId: string;
  messageType: SafeSendContext["messageType"];
  appUsage: string;
  pageUsage: string;
}) {
  try {
    const { error } = await supabaseAdmin.from("rate_limit_logs").insert({
      client_id: details.clientId,
      page_id: details.pageId,
      recipient_id: details.recipientId,
      message_type: `${details.messageType}_usage`,
      attempt_number: 0,
      status_code: 200,
      error_code: null,
      error_subcode: null,
      error_message: "Usage snapshot",
      x_app_usage: details.appUsage || null,
      x_page_usage: details.pageUsage || null,
      payload: {},
    });

    if (error) {
      console.warn("Failed to log usage snapshot to Supabase", error);
    }
  } catch (error) {
    console.warn("Failed to log usage snapshot to Supabase", error);
  }
}

async function logSendFailure(details: {
  clientId: string;
  pageId: string;
  recipientId: string;
  messageType: SafeSendContext["messageType"];
  statusCode: number;
  errorCode?: number;
  errorSubcode?: number;
  errorMessage: string;
  payload: MessengerRequestBody;
}) {
  try {
    const { error } = await supabaseAdmin.from("rate_limit_logs").insert({
      client_id: details.clientId,
      page_id: details.pageId,
      recipient_id: details.recipientId,
      message_type: `${details.messageType}_failed`,
      attempt_number: 0,
      status_code: details.statusCode,
      error_code: details.errorCode ?? null,
      error_subcode: details.errorSubcode ?? null,
      error_message: details.errorMessage,
      x_app_usage: null,
      x_page_usage: null,
      payload: details.payload,
    });

    if (error) {
      console.warn("Failed to log send failure to Supabase", error);
    }
  } catch (error) {
    console.warn("Failed to log send failure to Supabase", error);
  }
}

async function safelyHandleFlowSend(
  action: () => Promise<void>,
  context: SafeSendContext
) {
  try {
    await action();
  } catch (error) {
    console.error("Webhook send pipeline failed", error);
    await logSendFailure({
      clientId: context.clientId,
      pageId: context.pageId,
      recipientId: context.recipientId,
      messageType: context.messageType,
      statusCode: 0,
      errorMessage: error instanceof Error ? error.message : "Unknown send failure",
      payload: { recipient: { id: context.recipientId }, message: {} },
    });
  }
}

function createTextMessageBody(recipientId: string, text: string): MessengerRequestBody {
  return {
    recipient: { id: recipientId },
    message: { text },
  };
}

async function readRawBody(req: NextApiRequest) {
  const contentLengthHeader = req.headers["content-length"];
  const contentLength =
    typeof contentLengthHeader === "string"
      ? Number.parseInt(contentLengthHeader, 10)
      : Number.NaN;

  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BODY_BYTES) {
    throw new Error("Webhook body too large");
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const normalizedChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += normalizedChunk.length;

    if (totalBytes > MAX_WEBHOOK_BODY_BYTES) {
      throw new Error("Webhook body too large");
    }

    chunks.push(normalizedChunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function isValidWebhookSignature(
  rawBody: string,
  signatureHeader: string | string[] | undefined
) {
  const secret = process.env.FACEBOOK_APP_SECRET;

  if (!secret || typeof signatureHeader !== "string") {
    return false;
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const actual = signatureHeader.replace(/^sha256=/, "");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function sleep(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function withJitter(durationMs: number) {
  const jitter = Math.round(durationMs * 0.25 * Math.random());
  return durationMs + jitter;
}

