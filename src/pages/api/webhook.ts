import type { NextApiRequest, NextApiResponse } from "next";
import { createHmac, timingSafeEqual } from "node:crypto";
import { parseBotFlowNodeConfig } from "@/lib/bot-flow";
import { getClients, getFaqsForClient } from "@/lib/database";
import { askGemini } from "@/lib/gemini";
import { supabaseAdmin } from "@/lib/supabase";

export const config = {
  api: {
    bodyParser: false,
  },
};

const GRAPH_API_MESSAGES_URL = "https://graph.facebook.com/v20.0/me/messages";
const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;
const MAX_QUICK_REPLIES = 13;
const MAX_SEND_RETRIES = 5;
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000] as const;
const HIGH_USAGE_THRESHOLD = 80;
const HIGH_USAGE_DELAY_MS = 1500;
const BULK_MESSAGE_DELAY_MS = 350;
const REQUEST_TIMEOUT_MS = 15000;
const MAX_FORMATTED_TEXT_CHUNK_LENGTH = 280;
const MAX_TEMPLATE_TEXT_LENGTH = 640;
const FLOW_PAYLOAD_PREFIX = "FLOW_NODE:";
const GET_STARTED_PAYLOAD = "GET_STARTED";
const WELCOME_KEYWORDS = new Set(["get started", "get_started", "welcome", "start"]);

type ClientFlowNode = {
  id: string;
  keywords: string[];
  answer: string;
  imageAttachmentId: string;
};

type WebhookBody = {
  object?: string;
  entry?: Array<{
    id: string;
    messaging?: Array<{
      sender: { id: string };
      message?: {
        text?: string;
        quick_reply?: {
          payload?: string;
        };
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
  messageType: "text" | "quick_replies" | "button_template" | "image";
};

type ReplyCaptureSessionRow = {
  client_id: string;
  page_id: string;
  recipient_id: string;
  waiting_node_id: string;
  next_node_id: string;
};

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
        const clientFlowNodes = (await getFaqsForClient(client.id)).map((faq) => ({
          id: faq.id,
          keywords: faq.keywords.map((keyword) => normalizeText(keyword)).filter(Boolean),
          answer: faq.answer,
          imageAttachmentId: faq.image_attachment_id ?? "",
        }));

        for (const event of entry.messaging ?? []) {
          const userId = event.sender.id;
          const rawText = event.message?.text;
          const flowPayload = event.message?.quick_reply?.payload ?? event.postback?.payload;

          if (client.bot_type === "ai") {
            await clearReplyCaptureSession(client.id, userId);

            if (rawText) {
              await safelyHandleFlowSend(
                async () => {
                  const aiReply = await askGemini(rawText, client.business_info || "");
                  await safeSendMessage(userId, aiReply, pageAccessToken, 0, pageId, client.id);
                },
                { clientId: client.id, pageId, recipientId: userId, messageType: "text" }
              );
              continue;
            }

            if (flowPayload === GET_STARTED_PAYLOAD) {
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
            }

            continue;
          }

          if (flowPayload) {
            await clearReplyCaptureSession(client.id, userId);
            if (flowPayload === GET_STARTED_PAYLOAD) {
              const welcomeNode = resolveWelcomeNode(clientFlowNodes);

              if (welcomeNode) {
                await safelyHandleFlowSend(
                  () =>
                    sendFlowNodeMessage(
                      userId,
                      welcomeNode,
                      client.id,
                      pageId,
                      pageAccessToken,
                      clientFlowNodes
                    ),
                  { clientId: client.id, pageId, recipientId: userId, messageType: "text" }
                );
              }

              continue;
            }

            const targetNode = resolveQuickReplyTarget(client.id, flowPayload, clientFlowNodes);

            if (targetNode) {
              await safelyHandleFlowSend(
                () =>
                  sendFlowNodeMessage(
                    userId,
                    targetNode,
                    client.id,
                    pageId,
                    pageAccessToken,
                    clientFlowNodes
                  ),
                { clientId: client.id, pageId, recipientId: userId, messageType: "text" }
              );
            }

            continue;
          }

          if (!rawText) {
            continue;
          }

          const pendingReplySession = await getReplyCaptureSession(client.id, userId);
          if (pendingReplySession?.next_node_id) {
            await clearReplyCaptureSession(client.id, userId);
            const replyTargetNode = clientFlowNodes.find(
              (node) => node.id === pendingReplySession.next_node_id
            );

            if (replyTargetNode) {
              await safelyHandleFlowSend(
                () =>
                  sendFlowNodeMessage(
                    userId,
                    replyTargetNode,
                    client.id,
                    pageId,
                    pageAccessToken,
                    clientFlowNodes
                  ),
                { clientId: client.id, pageId, recipientId: userId, messageType: "text" }
              );
            }
            continue;
          }

          const userMessage = normalizeText(rawText);
          const matchedNode = clientFlowNodes.find((node) =>
            node.keywords.some((keyword) => messageMatchesKeyword(userMessage, keyword))
          );

          if (!matchedNode) {
            continue;
          }

          await safelyHandleFlowSend(
            () =>
              sendFlowNodeMessage(
                userId,
                matchedNode,
                client.id,
                pageId,
                pageAccessToken,
                clientFlowNodes
              ),
            { clientId: client.id, pageId, recipientId: userId, messageType: "text" }
          );
        }
      }
    }

    return res.status(200).json({ status: "ok" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

async function sendFlowNodeMessage(
  recipientId: string,
  node: ClientFlowNode,
  clientId: string,
  pageId: string,
  pageToken: string,
  clientFlowNodes: ClientFlowNode[]
) {
  const config = parseBotFlowNodeConfig(node.answer, node.keywords[0] || "Flow Card");
  const formattedMessageParts = formatMessengerTextParts(config.message);
  const combinedFormattedMessage = formattedMessageParts.join("\n\n").trim();
  const imageAttachmentIds = config.images.length ? config.images : node.imageAttachmentId ? [node.imageAttachmentId] : [];
  const validButtons = config.buttons.filter((button) =>
    clientFlowNodes.some((candidate) => candidate.id === button.targetNodeId)
  );
  const replyCaptureTargetNode = config.captureNextReply
    ? clientFlowNodes.find((candidate) => candidate.id === config.replyTargetNodeId)
    : null;
  const messages: Array<{ body: MessengerRequestBody; type: SafeSendContext["messageType"] }> = [];

  for (const imageAttachmentId of imageAttachmentIds) {
    messages.push({
      type: "image",
      body: createImageMessageBody(recipientId, imageAttachmentId),
    });
  }

  if (validButtons.length > 0) {
    const templateText =
      combinedFormattedMessage.length > 0 && combinedFormattedMessage.length <= MAX_TEMPLATE_TEXT_LENGTH
        ? combinedFormattedMessage
        : "";
    const leadTextParts =
      templateText || formattedMessageParts.length === 0
        ? []
        : formattedMessageParts.slice(0, -1);
    const finalTemplateText =
      templateText ||
      formattedMessageParts[formattedMessageParts.length - 1] ||
      "Choose an option below.";

    for (const textPart of leadTextParts) {
      messages.push({
        type: "text",
        body: createTextMessageBody(recipientId, textPart),
      });
    }

    if (validButtons.length <= 3) {
      messages.push({
        type: "button_template",
        body: createButtonTemplateMessageBody(
          recipientId,
          finalTemplateText,
          validButtons.map((button) => ({
            title: button.label,
            payload: createFlowPayload(clientId, button.targetNodeId),
          }))
        ),
      });
    } else {
      messages.push({
        type: "quick_replies",
        body: createQuickRepliesMessageBody(
          recipientId,
          finalTemplateText,
          validButtons.map((button) => ({
            title: button.label,
            payload: createFlowPayload(clientId, button.targetNodeId),
          }))
        ),
      });
    }
  }
  await sendMessageBatch(messages, pageToken, {
    clientId,
    pageId,
    recipientId,
  });

  if (!validButtons.length && formattedMessageParts.length > 0) {
    if (messages.length > 0) {
      await sleep(BULK_MESSAGE_DELAY_MS);
    }

    for (let index = 0; index < formattedMessageParts.length; index += 1) {
      const messagePart = formattedMessageParts[index];

      if (!messagePart) {
        continue;
      }

      if (index > 0) {
        await sleep(BULK_MESSAGE_DELAY_MS);
      }

      await safeSendMessage(recipientId, messagePart, pageToken, 0, pageId, clientId);
    }
  }

  if (replyCaptureTargetNode) {
    await upsertReplyCaptureSession({
      client_id: clientId,
      page_id: pageId,
      recipient_id: recipientId,
      waiting_node_id: node.id,
      next_node_id: replyCaptureTargetNode.id,
    });
  }
}

async function sendMessageBatch(
  messages: Array<{ body: MessengerRequestBody; type: SafeSendContext["messageType"] }>,
  pageToken: string,
  baseContext: Omit<SafeSendContext, "messageType">
) {
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];

    if (!message) {
      continue;
    }

    if (index > 0) {
      await sleep(BULK_MESSAGE_DELAY_MS);
    }

    await safeSendApiRequest(message.body, pageToken, {
      ...baseContext,
      messageType: message.type,
    });
  }
}

async function getReplyCaptureSession(clientId: string, recipientId: string) {
  const { data, error } = await supabaseAdmin
    .from("bot_flow_reply_sessions")
    .select("client_id, page_id, recipient_id, waiting_node_id, next_node_id")
    .eq("client_id", clientId)
    .eq("recipient_id", recipientId)
    .maybeSingle();

  if (error) {
    console.warn("Failed to load reply capture session", error);
    return null;
  }

  return (data as ReplyCaptureSessionRow | null) ?? null;
}

async function upsertReplyCaptureSession(session: ReplyCaptureSessionRow) {
  const { error } = await supabaseAdmin
    .from("bot_flow_reply_sessions")
    .upsert(
      {
        ...session,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id,recipient_id" }
    );

  if (!error) {
    return;
  }

  const { error: fallbackDeleteError } = await supabaseAdmin
    .from("bot_flow_reply_sessions")
    .delete()
    .eq("client_id", session.client_id)
    .eq("recipient_id", session.recipient_id);

  if (fallbackDeleteError) {
    console.warn("Failed to clear existing reply capture session", fallbackDeleteError);
  }

  const { error: fallbackInsertError } = await supabaseAdmin
    .from("bot_flow_reply_sessions")
    .insert(session);

  if (fallbackInsertError) {
    console.warn("Failed to save reply capture session", fallbackInsertError);
  }
}

async function clearReplyCaptureSession(clientId: string, recipientId: string) {
  const { error } = await supabaseAdmin
    .from("bot_flow_reply_sessions")
    .delete()
    .eq("client_id", clientId)
    .eq("recipient_id", recipientId);

  if (error) {
    console.warn("Failed to clear reply capture session", error);
  }
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

async function safeSendApiRequest(
  body: MessengerRequestBody,
  pageToken: string,
  context: SafeSendContext
) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_SEND_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(GRAPH_API_MESSAGES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pageToken}`,
        },
        signal: controller.signal,
        body: JSON.stringify(body),
      });
      clearTimeout(timeoutId);

      const responseText = await response.text().catch(() => "");
      const errorPayload = parseMessengerErrorPayload(responseText);
      const usageSummary = getUsageSummary(response.headers);

      if (response.ok) {
        await handleUsageSummary(context, usageSummary);
        return;
      }

      const errorCode = errorPayload?.error?.code;
      const errorMessage = errorPayload?.error?.message || responseText || response.statusText;
      const isRateLimited = response.status === 429 || errorCode === 4 || errorCode === 32;

      if (isRateLimited) {
        console.warn(
          `[Messenger Rate Limit] ${context.messageType} send throttled for page ${context.pageId} and recipient ${context.recipientId}. Attempt ${attempt + 1}/${MAX_SEND_RETRIES}.`,
          {
            status: response.status,
            errorCode,
            errorMessage,
            appUsage: usageSummary.appUsageRaw,
            pageUsage: usageSummary.pageUsageRaw,
          }
        );

        await logRateLimitEvent({
          ...context,
          attempt: attempt + 1,
          statusCode: response.status,
          errorCode,
          errorSubcode: errorPayload?.error?.error_subcode,
          errorMessage,
          appUsage: usageSummary.appUsageRaw,
          pageUsage: usageSummary.pageUsageRaw,
          payload: body,
        });

        if (attempt < MAX_SEND_RETRIES - 1) {
          await sleep(withJitter(RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]));
          continue;
        }
      }

      lastError = new Error(`Messenger API request failed (${response.status}): ${errorMessage}`);
      await logSendFailure({
        clientId: context.clientId,
        pageId: context.pageId,
        recipientId: context.recipientId,
        messageType: context.messageType,
        statusCode: response.status,
        errorCode,
        errorSubcode: errorPayload?.error?.error_subcode,
        errorMessage,
        payload: body,
      });
      break;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error instanceof Error ? error : new Error("Unknown send error");

      if (attempt < MAX_SEND_RETRIES - 1) {
        console.warn(
          `[Messenger Send] ${context.messageType} send failed for page ${context.pageId}. Retrying in ${withJitter(RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1])}ms.`,
          error
        );
        await sleep(withJitter(RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]));
        continue;
      }

      await logSendFailure({
        clientId: context.clientId,
        pageId: context.pageId,
        recipientId: context.recipientId,
        messageType: context.messageType,
        statusCode: 0,
        errorMessage: lastError.message,
        payload: body,
      });
      break;
    }
  }

  throw lastError ?? new Error("Messenger API request failed for an unknown reason.");
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

async function logRateLimitEvent(details: {
  clientId: string;
  pageId: string;
  recipientId: string;
  messageType: SafeSendContext["messageType"];
  attempt: number;
  statusCode: number;
  errorCode?: number;
  errorSubcode?: number;
  errorMessage: string;
  appUsage: string;
  pageUsage: string;
  payload: MessengerRequestBody;
}) {
  try {
    const { error } = await supabaseAdmin.from("rate_limit_logs").insert({
      client_id: details.clientId,
      page_id: details.pageId,
      recipient_id: details.recipientId,
      message_type: details.messageType,
      attempt_number: details.attempt,
      status_code: details.statusCode,
      error_code: details.errorCode ?? null,
      error_subcode: details.errorSubcode ?? null,
      error_message: details.errorMessage,
      x_app_usage: details.appUsage || null,
      x_page_usage: details.pageUsage || null,
      payload: details.payload,
    });

    if (error) {
      console.warn("Failed to log rate limit event to Supabase", error);
    }
  } catch (error) {
    console.warn("Failed to log rate limit event to Supabase", error);
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

function resolveQuickReplyTarget(
  clientId: string,
  payload: string,
  nodes: ClientFlowNode[]
) {
  const parsed = parseFlowPayload(payload);

  if (!parsed || parsed.clientId !== clientId) {
    return null;
  }

  return nodes.find((node) => node.id === parsed.nodeId) ?? null;
}

function resolveWelcomeNode(nodes: ClientFlowNode[]) {
  if (!nodes.length) {
    return null;
  }

  const explicitWelcomeNode = nodes.find((node) =>
    node.keywords.some((keyword) => WELCOME_KEYWORDS.has(keyword))
  );

  if (explicitWelcomeNode) {
    return explicitWelcomeNode;
  }

  const sortByCanvasPosition = (left: ClientFlowNode, right: ClientFlowNode) => {
    const leftConfig = parseBotFlowNodeConfig(left.answer, left.keywords[0] || "Flow Card");
    const rightConfig = parseBotFlowNodeConfig(right.answer, right.keywords[0] || "Flow Card");

    if (leftConfig.position.y !== rightConfig.position.y) {
      return leftConfig.position.y - rightConfig.position.y;
    }

    return leftConfig.position.x - rightConfig.position.x;
  };

  const keywordlessNodes = nodes
    .filter((node) => node.keywords.length === 0)
    .sort(sortByCanvasPosition);

  if (keywordlessNodes.length > 0) {
    return keywordlessNodes[0] ?? null;
  }

  return [...nodes].sort(sortByCanvasPosition)[0] ?? null;
}

function createFlowPayload(clientId: string, nodeId: string) {
  return `${FLOW_PAYLOAD_PREFIX}${clientId}:${nodeId}`;
}

function parseFlowPayload(payload: string) {
  if (!payload.startsWith(FLOW_PAYLOAD_PREFIX)) {
    return null;
  }

  const raw = payload.slice(FLOW_PAYLOAD_PREFIX.length);
  const [clientId, nodeId] = raw.split(":");

  if (!clientId || !nodeId) {
    return null;
  }

  return { clientId, nodeId };
}

function formatMessengerTextParts(text: string) {
  const normalizedText = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (!normalizedText) {
    return [];
  }

  const paragraphs = normalizedText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const parts: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length <= MAX_FORMATTED_TEXT_CHUNK_LENGTH) {
      parts.push(paragraph);
      continue;
    }

    const sentences = paragraph
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    if (sentences.length <= 1) {
      parts.push(...splitLongTextBlock(paragraph, MAX_FORMATTED_TEXT_CHUNK_LENGTH));
      continue;
    }

    let currentPart = "";

    for (const sentence of sentences) {
      const candidate = currentPart ? `${currentPart} ${sentence}` : sentence;

      if (candidate.length <= MAX_FORMATTED_TEXT_CHUNK_LENGTH) {
        currentPart = candidate;
        continue;
      }

      if (currentPart) {
        parts.push(currentPart);
      }

      if (sentence.length <= MAX_FORMATTED_TEXT_CHUNK_LENGTH) {
        currentPart = sentence;
      } else {
        parts.push(...splitLongTextBlock(sentence, MAX_FORMATTED_TEXT_CHUNK_LENGTH));
        currentPart = "";
      }
    }

    if (currentPart) {
      parts.push(currentPart);
    }
  }

  return parts;
}

function splitLongTextBlock(text: string, maxLength: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const parts: string[] = [];
  let currentPart = "";

  for (const word of words) {
    const candidate = currentPart ? `${currentPart} ${word}` : word;

    if (candidate.length <= maxLength) {
      currentPart = candidate;
      continue;
    }

    if (currentPart) {
      parts.push(currentPart);
    }

    if (word.length <= maxLength) {
      currentPart = word;
      continue;
    }

    for (let index = 0; index < word.length; index += maxLength) {
      parts.push(word.slice(index, index + maxLength));
    }

    currentPart = "";
  }

  if (currentPart) {
    parts.push(currentPart);
  }

  return parts;
}
function createTextMessageBody(recipientId: string, text: string): MessengerRequestBody {
  return {
    recipient: { id: recipientId },
    message: { text },
  };
}

function createQuickRepliesMessageBody(
  recipientId: string,
  text: string,
  quickReplies: Array<{ title: string; payload: string }>
): MessengerRequestBody {
  const limitedQuickReplies = quickReplies.slice(0, MAX_QUICK_REPLIES);

  return {
    recipient: { id: recipientId },
    message: {
      text,
      quick_replies: limitedQuickReplies.map((quickReply) => ({
        content_type: "text",
        title: quickReply.title,
        payload: quickReply.payload,
      })),
    },
  };
}

function createButtonTemplateMessageBody(
  recipientId: string,
  text: string,
  buttons: Array<{ title: string; payload: string }>
): MessengerRequestBody {
  return {
    recipient: { id: recipientId },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text,
          buttons: buttons.slice(0, 3).map((button) => ({
            type: "postback",
            title: button.title,
            payload: button.payload,
          })),
        },
      },
    },
  };
}

function createImageMessageBody(recipientId: string, attachmentId: string): MessengerRequestBody {
  return {
    recipient: { id: recipientId },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "media",
          elements: [{ media_type: "image", attachment_id: attachmentId }],
        },
      },
    },
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

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function messageMatchesKeyword(message: string, keyword: string) {
  if (!message || !keyword) {
    return false;
  }

  return message === keyword;
}

function sleep(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function withJitter(durationMs: number) {
  const jitter = Math.round(durationMs * 0.25 * Math.random());
  return durationMs + jitter;
}






















