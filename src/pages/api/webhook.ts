import type { NextApiRequest, NextApiResponse } from "next";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  getAiConversation,
  getClients,
  pauseAiConversation,
  recordAiConversationReply,
  recordCustomerConversationMessage,
  recordWelcomeSequenceSent,
  resumeAiConversation,
} from "@/lib/database";
import { askAi, planAiReply, type LeadCaptureIntent } from "@/lib/ai-chat";
import {
  appendRecentConversationMessages,
  getDeterministicReply,
  inferCustomerState,
  updateConversationSummary,
} from "@/lib/conversation-memory";
import { sendLeadToGoogleSheet } from "@/lib/google-sheets";
import {
  createLeadInformationPrompt,
  extractFormattedLeadFromMessage,
  extractLeadFromMessage,
  parseLeadFields,
} from "@/lib/lead-capture";
import { getLeadCapturedReply } from "@/lib/language-style";
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
const DEFAULT_MANUAL_AI_PAUSE_MINUTES = 5;
const HUMAN_REPLY_MIN_DELAY_MS = 4500;
const HUMAN_REPLY_MAX_DELAY_MS = 12000;
const HUMAN_REPLY_MS_PER_CHAR = 35;
const AUTO_REPLY_NAME_TOKEN = "{name}";

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

type MessengerSenderActionBody = {
  recipient: { id: string };
  sender_action: "typing_on" | "typing_off" | "mark_seen";
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
  messageType: "text" | "image";
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

function isManualPageTextEcho(
  event: NonNullable<NonNullable<WebhookBody["entry"]>[number]["messaging"]>[number],
  pageId: string
) {
  return Boolean(
    event.message?.is_echo &&
      event.sender.id === pageId &&
      event.recipient?.id &&
      event.message.text
  );
}

function normalizeEchoText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function patternPartToRegExp(value: string) {
  return escapeRegExp(normalizeEchoText(value)).replace(/\s+/g, "\\s+");
}

function matchesAutoReplyIgnorePattern(message: string, pattern = "") {
  const normalizedPattern = normalizeEchoText(pattern);

  if (!normalizedPattern) {
    return false;
  }

  const tokenIndex = normalizedPattern.toLowerCase().indexOf(AUTO_REPLY_NAME_TOKEN);

  if (tokenIndex === -1) {
    const exactPattern = new RegExp(`^${patternPartToRegExp(normalizedPattern)}$`, "i");

    return exactPattern.test(normalizeEchoText(message));
  }

  const beforeName = normalizedPattern.slice(0, tokenIndex);
  const afterName = normalizedPattern.slice(tokenIndex + AUTO_REPLY_NAME_TOKEN.length);
  const patternRegExp = new RegExp(
    `^${patternPartToRegExp(beforeName)}[\\s\\S]+?${patternPartToRegExp(afterName)}$`,
    "i"
  );

  return patternRegExp.test(normalizeEchoText(message));
}

function isOwnAppEcho(
  event: NonNullable<NonNullable<WebhookBody["entry"]>[number]["messaging"]>[number]
) {
  const configuredAppId = process.env.FACEBOOK_APP_ID?.trim();
  const eventAppId = event.message?.app_id ? String(event.message.app_id).trim() : "";

  return Boolean(configuredAppId && eventAppId && eventAppId === configuredAppId);
}

function isLastAiReplyEcho(
  text: string,
  conversation: Awaited<ReturnType<typeof getAiConversation>>
) {
  const lastAiReply = conversation?.last_ai_reply || "";

  return Boolean(lastAiReply && normalizeEchoText(text) === normalizeEchoText(lastAiReply));
}

function summarizePageEcho(
  event: NonNullable<NonNullable<WebhookBody["entry"]>[number]["messaging"]>[number]
) {
  return {
    senderId: event.sender.id,
    recipientId: event.recipient?.id || "",
    appId: event.message?.app_id ? String(event.message.app_id) : "",
    textPreview: event.message?.text?.slice(0, 120) || "",
  };
}

async function safelyPauseAiForOwnerReply(input: {
  clientId: string;
  pageId: string;
  recipientId: string;
  pauseMinutes: number;
}) {
  try {
    const pauseExpiresAt = new Date(
      Date.now() + input.pauseMinutes * 60 * 1000
    ).toISOString();

    await pauseAiConversation({
      clientId: input.clientId,
      pageId: input.pageId,
      recipientId: input.recipientId,
      pausedBy: "owner",
      pauseExpiresAt,
    });
  } catch (error) {
    console.warn("Failed to pause AI after owner reply", error);
  }
}

async function safelyResumeExpiredPause(clientId: string, recipientId: string) {
  try {
    await resumeAiConversation(clientId, recipientId);
  } catch (error) {
    console.warn("Failed to resume expired AI pause", error);
  }
}

function isPauseStillActive(conversation: Awaited<ReturnType<typeof getAiConversation>>) {
  if (!conversation?.ai_paused) {
    return false;
  }

  if (!conversation.ai_pause_expires_at) {
    return true;
  }

  const expiresAt = new Date(conversation.ai_pause_expires_at).getTime();

  return Number.isNaN(expiresAt) || expiresAt > Date.now();
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

async function safelyGetAiConversation(clientId: string, recipientId: string) {
  try {
    return await getAiConversation(clientId, recipientId);
  } catch (error) {
    console.warn("Failed to load AI conversation state", error);
    return null;
  }
}

async function safelyRecordAiReply(input: {
  clientId: string;
  pageId: string;
  recipientId: string;
  reply: string;
  conversationSummary?: string;
  customerState?: Record<string, unknown>;
  recentMessages?: Array<{ role: string; content: string }>;
}) {
  try {
    await recordAiConversationReply(input);
  } catch (error) {
    console.warn("Failed to record AI reply", error);
  }
}

async function safelyRecordWelcomeSequenceSent(input: {
  clientId: string;
  pageId: string;
  recipientId: string;
}) {
  try {
    await recordWelcomeSequenceSent(input);
  } catch (error) {
    console.warn("Failed to record welcome sequence", error);
  }
}

async function safelyCaptureLead(input: {
  clientName: string;
  pageId: string;
  recipientId: string;
  message: string;
  googleSheetsWebhookUrl: string;
  googleSheetsTabName: string;
  leadFields: string[];
}) {
  const lead =
    extractFormattedLeadFromMessage(input.message, input.leadFields) ??
    extractLeadFromMessage(input.message, input.leadFields);

  if (!lead) {
    console.info("Google Sheets lead capture skipped: lead details not detected", {
      pageId: input.pageId,
      recipientId: input.recipientId,
      requiredFields: input.leadFields,
      preview: input.message.slice(0, 120),
    });
    return false;
  }

  try {
    const sent = await sendLeadToGoogleSheet({
      fullName: lead.fullName,
      phone: lead.phone,
      pageId: input.pageId,
      pageName: input.clientName,
      sheetName: input.googleSheetsTabName,
      recipientId: input.recipientId,
      message: input.message,
      capturedAt: new Date().toISOString(),
      fields: lead.fields,
    }, { webhookUrl: input.googleSheetsWebhookUrl });

    if (sent) {
      console.info("Google Sheets lead captured", {
        pageId: input.pageId,
        recipientId: input.recipientId,
        fields: Object.keys(lead.fields),
      });
      return true;
    }
  } catch (error) {
    console.warn("Failed to send lead to Google Sheet", error);
  }

  return false;
}

type LeadPromptReason =
  | "order"
  | "booking"
  | "human_contact"
  | "quote"
  | "reservation"
  | "generic";

function wasLeadFormatRecentlyRequested(
  conversation: Awaited<ReturnType<typeof safelyGetAiConversation>>
) {
  const lastReply = conversation?.last_ai_reply?.toLowerCase() ?? "";
  const recentAssistantReplies =
    conversation?.recent_messages
      ?.filter((message) => message.role === "assistant")
      .map((message) => message.content.toLowerCase())
      .join(" ") ?? "";
  const recentText = `${lastReply} ${recentAssistantReplies}`;

  return (
    recentText.includes("full name:") &&
    (recentText.includes("phone:") || recentText.includes("contact number:"))
  );
}

function wasLeadAlreadyCaptured(
  conversation: Awaited<ReturnType<typeof safelyGetAiConversation>>
) {
  return conversation?.customer_state?.lead_status === "captured";
}

function getFallbackLeadIntent(message: string): LeadCaptureIntent {
  const normalizedMessage = message.toLowerCase().replace(/\s+/g, " ").trim();

  if (isClearlyInfoOnlyMessage(normalizedMessage)) {
    return "INFO_ONLY";
  }

  const providesLeadDetails =
    /\b(?:name|full name|phone|contact|mobile|number)\s*[:\-]/i.test(normalizedMessage) &&
    /(?:\+?\d[\d\s().-]{7,}\d)/.test(normalizedMessage);

  if (providesLeadDetails) {
    return "PROVIDED_LEAD_DETAILS";
  }

  const wantsHumanContact =
    /\b(?:call me|contact me|message me|pm me|dm me|talk to|speak to|agent|specialist|human|staff|representative|someone\s+(?:call|contact|assist)|pa\s*(?:call|contact)|tawag(?:an)?|kausap)\b/i.test(
      normalizedMessage
    );

  if (wantsHumanContact) {
    return "WANTS_HUMAN_CONTACT";
  }

  const readyToBuyOrBook =
    /\b(?:i want to|i'd like to|ill|i'll|let me|can i|please)\s+(?:order|buy|purchase|reserve|book|schedule|avail|proceed)\b/i.test(
      normalizedMessage
    ) ||
    /\b(?:order now|place order|checkout|buy now|reserve now|book now|schedule viewing|book viewing|set appointment|make appointment|proceed with|go ahead|sign me up)\b/i.test(
      normalizedMessage
    ) ||
    /\b(?:pa\s*reserve|pa\s*book|magpa\s*book|magpa\s*reserve|gusto\s+ko\s+(?:bumili|mag\s*order|magpa\s*reserve|magpa\s*book))\b/i.test(
      normalizedMessage
    );

  if (readyToBuyOrBook) {
    return "READY_TO_BUY_OR_BOOK";
  }

  return "UNCLEAR";
}

function isClearlyInfoOnlyMessage(normalizedMessage: string) {
  const withoutPoliteWords = normalizedMessage
    .replace(/\b(?:po|please|pls|sir|maam|ma'am|boss|thanks|thank you|salamat)\b/gi, "")
    .replace(/[^\p{L}\p{N}\s?]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const asksForInfoOnly =
    /\b(details?|info|information|price|how much|hm|available|availability|requirements?|photos?|pictures?|location|sample computation|computation|monthly|amortization|dp|down payment)\b/i.test(
      normalizedMessage
    ) ||
    /\bhow\s+(?:to|do i|can i)\s+(?:order|buy|book|reserve|schedule|get|avail)/i.test(
      normalizedMessage
    );

  return (
    asksForInfoOnly &&
    !/\b(?:call me|contact me|message me|pm me|dm me|talk to|speak to|agent|specialist|human|staff|representative|order now|place order|checkout|buy now|reserve now|book now|schedule viewing|book viewing|set appointment|make appointment|proceed with|go ahead|pa\s*reserve|pa\s*book|magpa\s*book|magpa\s*reserve)\b/i.test(
      normalizedMessage
    ) &&
    withoutPoliteWords.split(/\s+/).filter(Boolean).length <= 6
  );
}

function getLeadCaptureIntentFromPlan(message: string, planIntent: LeadCaptureIntent) {
  const normalizedMessage = message.toLowerCase().replace(/\s+/g, " ").trim();

  if (isClearlyInfoOnlyMessage(normalizedMessage)) {
    return "INFO_ONLY";
  }

  if (planIntent !== "UNCLEAR") {
    return planIntent;
  }

  return getFallbackLeadIntent(message);
}

function shouldUseAiReplyPlanner(
  message: string,
  conversation: Awaited<ReturnType<typeof safelyGetAiConversation>>,
  fallbackIntent: LeadCaptureIntent
) {
  if (fallbackIntent !== "UNCLEAR") {
    return false;
  }

  const normalizedMessage = message.toLowerCase().replace(/\s+/g, " ").trim();
  const words = normalizedMessage.split(/\s+/).filter(Boolean);
  const hasConversationContext = Boolean(
    conversation?.last_ai_reply || conversation?.recent_messages?.length
  );
  const isShortContextualReply =
    words.length <= 3 ||
    /^(?:yes|yeah|yep|sure|ok|okay|no|nope|why|how|hm|that|this|that one|this one|go|sige|oo|opo|hindi|dili|1br|2br|3br)\b/i.test(
      normalizedMessage
    );
  const refersToPreviousMessage =
    /\b(?:that|this|it|one|option|same|previous|earlier|yes please|go ahead|tell me more)\b/i.test(
      normalizedMessage
    );

  return hasConversationContext && (isShortContextualReply || refersToPreviousMessage);
}

function shouldAskForLeadFormat(
  intent: LeadCaptureIntent,
  conversation: Awaited<ReturnType<typeof safelyGetAiConversation>>
) {
  if (wasLeadFormatRecentlyRequested(conversation)) {
    return false;
  }

  return intent === "READY_TO_BUY_OR_BOOK" || intent === "WANTS_HUMAN_CONTACT";
}

function getLeadPromptReason(intent: LeadCaptureIntent, message: string): LeadPromptReason {
  const normalizedMessage = message.toLowerCase();

  if (intent === "WANTS_HUMAN_CONTACT") {
    return "human_contact";
  }

  if (/\b(?:reserve|reservation|pa\s*reserve)\b/i.test(normalizedMessage)) {
    return "reservation";
  }

  if (/\b(?:book|booking|schedule|appointment|viewing|visit|pa\s*book|magpa\s*book)\b/i.test(normalizedMessage)) {
    return "booking";
  }

  if (/\b(?:quote|quotation|estimate|formal quote)\b/i.test(normalizedMessage)) {
    return "quote";
  }

  if (/\b(?:order|buy|purchase|checkout|bumili)\b/i.test(normalizedMessage)) {
    return "order";
  }

  return "generic";
}

function createLeadFormatReply(
  leadFields: string[],
  intent: LeadCaptureIntent,
  customerMessage: string
) {
  return createLeadInformationPrompt(leadFields, {
    reason: getLeadPromptReason(intent, customerMessage),
    customerMessage,
  });
}

function getWelcomeImageAttachmentIds(value: string) {
  return value
    .split(/\r?\n/)
    .map((attachmentId) => attachmentId.trim())
    .filter(Boolean)
    .slice(0, 11);
}

function hasWelcomeSequenceContent(client: Awaited<ReturnType<typeof getClients>>[number]) {
  return Boolean(
    client.welcome_message.trim() ||
      client.welcome_link_url.trim() ||
      getWelcomeImageAttachmentIds(client.welcome_image_urls).length > 0
  );
}

function shouldSendWelcomeSequence(
  client: Awaited<ReturnType<typeof getClients>>[number],
  conversation: Awaited<ReturnType<typeof safelyGetAiConversation>>
) {
  return (
    client.welcome_sequence_enabled &&
    !conversation?.welcome_sequence_sent &&
    hasWelcomeSequenceContent(client)
  );
}

async function sendWelcomeSequence(input: {
  client: Awaited<ReturnType<typeof getClients>>[number];
  pageId: string;
  recipientId: string;
  pageAccessToken: string;
}) {
  const message = input.client.welcome_message.trim();
  const linkUrl = input.client.welcome_link_url.trim();
  const imageAttachmentIds = getWelcomeImageAttachmentIds(input.client.welcome_image_urls);

  if (linkUrl) {
    await safelyHandleFlowSend(
      () =>
        safeSendMessage(
          input.recipientId,
          linkUrl,
          input.pageAccessToken,
          0,
          input.pageId,
          input.client.id
        ).then(() => undefined),
      {
        clientId: input.client.id,
        pageId: input.pageId,
        recipientId: input.recipientId,
        messageType: "text",
      }
    );
  }

  for (const attachmentId of imageAttachmentIds) {
    await safelyHandleFlowSend(
      () =>
        safeSendImage(
          input.recipientId,
          attachmentId,
          input.pageAccessToken,
          0,
          input.pageId,
          input.client.id
        ).then(() => undefined),
      {
        clientId: input.client.id,
        pageId: input.pageId,
        recipientId: input.recipientId,
        messageType: "image",
      }
    );
  }

  if (message) {
    await safelyHandleFlowSend(
      () =>
        safeSendMessage(
          input.recipientId,
          message,
          input.pageAccessToken,
          0,
          input.pageId,
          input.client.id
        ).then(() => undefined),
      {
        clientId: input.client.id,
        pageId: input.pageId,
        recipientId: input.recipientId,
        messageType: "text",
      }
    );
  }

  await safelyRecordWelcomeSequenceSent({
    clientId: input.client.id,
    pageId: input.pageId,
    recipientId: input.recipientId,
  });
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
        const leadFields = parseLeadFields(client.lead_capture_fields);

        for (const event of entry.messaging ?? []) {
          const userId = getConversationRecipientId(event);
          const rawText = event.message?.text;
          const postbackPayload = event.postback?.payload;

          if (event.message?.is_echo && event.sender.id === pageId) {
            console.info("Page echo received", {
              clientId: client.id,
              pageId,
              userId,
              ...summarizePageEcho(event),
            });
          }

          if (isManualPageTextEcho(event, pageId)) {
            const echoText = event.message?.text || "";

            if (isOwnAppEcho(event)) {
              console.info("AI webhook ignored own app Page message echo", {
                clientId: client.id,
                pageId,
                userId,
                ...summarizePageEcho(event),
              });
              continue;
            }

            if (matchesAutoReplyIgnorePattern(echoText, client.auto_reply_ignore_pattern)) {
              console.info("AI webhook ignored configured Page auto-reply echo", {
                clientId: client.id,
                pageId,
                userId,
                appId: event.message?.app_id ? String(event.message.app_id) : "",
              });
              continue;
            }

            const existingPageConversation = await safelyGetAiConversation(client.id, userId);

            if (isLastAiReplyEcho(echoText, existingPageConversation)) {
              console.info("AI webhook ignored last AI reply Page echo", {
                clientId: client.id,
                pageId,
                userId,
              });
              continue;
            }

            await safelyPauseAiForOwnerReply({
              clientId: client.id,
              pageId,
              recipientId: userId,
              pauseMinutes: client.manual_ai_pause_minutes || DEFAULT_MANUAL_AI_PAUSE_MINUTES,
            });
            console.info("AI paused after manual page reply", {
              clientId: client.id,
              pageId,
              userId,
              appId: event.message?.app_id ? String(event.message.app_id) : "",
              ignoredPatternConfigured: Boolean(client.auto_reply_ignore_pattern?.trim()),
              pauseMinutes: client.manual_ai_pause_minutes || DEFAULT_MANUAL_AI_PAUSE_MINUTES,
            });
            continue;
          }

          if (event.message?.is_echo) {
            console.info("AI webhook ignored Page message echo without takeover trigger", {
              clientId: client.id,
              pageId,
              userId,
              ...summarizePageEcho(event),
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

          const existingConversation = await safelyGetAiConversation(client.id, userId);

          if (rawText) {
            await safelyRecordCustomerMessage({
              clientId: client.id,
              pageId,
              recipientId: userId,
              message: rawText,
            });

            const capturedLead = wasLeadAlreadyCaptured(existingConversation)
              ? false
              : await safelyCaptureLead({
                  clientName: client.client_name,
                  pageId,
                  recipientId: userId,
                  message: rawText,
                  googleSheetsWebhookUrl: client.google_sheets_webhook_url,
                  googleSheetsTabName: client.google_sheets_tab_name,
                  leadFields,
                });

            if (capturedLead) {
              const reply = getLeadCapturedReply(rawText);
              const customerState = inferCustomerState(
                existingConversation?.customer_state,
                rawText,
                true
              );
              const recentMessages = appendRecentConversationMessages(
                existingConversation?.recent_messages,
                rawText,
                reply
              );
              const conversationSummary = updateConversationSummary(
                existingConversation?.conversation_summary || "",
                rawText,
                reply
              );

              await safelyHandleFlowSend(
                () =>
                  safeSendHumanTextReply(
                    userId,
                    reply,
                    pageAccessToken,
                    pageId,
                    client.id
                  ).then(() => undefined),
                { clientId: client.id, pageId, recipientId: userId, messageType: "text" }
              );
              await safelyRecordAiReply({
                clientId: client.id,
                pageId,
                recipientId: userId,
                reply,
                conversationSummary,
                customerState,
                recentMessages,
              });
              continue;
            }

          }

          if (!client.ai_enabled) {
            console.info("AI webhook skipped disabled page", {
              clientId: client.id,
              pageId,
              userId,
            });
            continue;
          }

          if (isPauseStillActive(existingConversation)) {
            console.info("AI webhook skipped paused conversation", {
              clientId: client.id,
              pageId,
              userId,
            });
            continue;
          }

          if (existingConversation?.ai_paused) {
            await safelyResumeExpiredPause(client.id, userId);
          }

          if (
            rawText &&
            shouldSendWelcomeSequence(client, existingConversation)
          ) {
            await sendWelcomeSequence({
              client,
              pageId,
              recipientId: userId,
              pageAccessToken,
            });
          }

          if (rawText) {
            const deterministicReply = getDeterministicReply(rawText);

            if (deterministicReply) {
              const customerState = inferCustomerState(existingConversation?.customer_state, rawText);
              const recentMessages = appendRecentConversationMessages(
                existingConversation?.recent_messages,
                rawText,
                deterministicReply
              );
              const conversationSummary = updateConversationSummary(
                existingConversation?.conversation_summary || "",
                rawText,
                deterministicReply
              );

              await safelyHandleFlowSend(
                () =>
                  safeSendHumanTextReply(
                    userId,
                    deterministicReply,
                    pageAccessToken,
                    pageId,
                    client.id
                  ).then(() => undefined),
                { clientId: client.id, pageId, recipientId: userId, messageType: "text" }
              );
              await safelyRecordAiReply({
                clientId: client.id,
                pageId,
                recipientId: userId,
                reply: deterministicReply,
                conversationSummary,
                customerState,
                recentMessages,
              });
              continue;
            }

            const aiConversationContext = {
              previousCustomerMessage: existingConversation?.last_customer_message,
              previousAiReply: existingConversation?.last_ai_reply,
              conversationSummary: existingConversation?.conversation_summary,
              customerState: existingConversation?.customer_state,
              recentMessages: existingConversation?.recent_messages,
              aiCharacter: client.ai_character,
              aiTone: client.ai_tone,
            };
            const fallbackLeadIntent = getFallbackLeadIntent(rawText);
            const shouldPlanReply = shouldUseAiReplyPlanner(
              rawText,
              existingConversation,
              fallbackLeadIntent
            );
            const replyPlan = shouldPlanReply
              ? await planAiReply(rawText, client.business_info || "", aiConversationContext)
              : undefined;
            const leadIntent = getLeadCaptureIntentFromPlan(
              rawText,
              replyPlan?.leadCaptureIntent ?? fallbackLeadIntent
            );

            if (!shouldPlanReply) {
              console.info("AI reply planner skipped for token control", {
                clientId: client.id,
                pageId,
                userId,
                fallbackLeadIntent,
              });
            }

            if (shouldAskForLeadFormat(leadIntent, existingConversation)) {
              const reply = createLeadFormatReply(leadFields, leadIntent, rawText);
              const customerState = inferCustomerState(
                existingConversation?.customer_state,
                rawText
              );
              const recentMessages = appendRecentConversationMessages(
                existingConversation?.recent_messages,
                rawText,
                reply
              );
              const conversationSummary = updateConversationSummary(
                existingConversation?.conversation_summary || "",
                rawText,
                reply
              );

              await safelyHandleFlowSend(
                () =>
                  safeSendMessage(
                    userId,
                    reply,
                    pageAccessToken,
                    0,
                    pageId,
                    client.id
                  ).then(() => undefined),
                { clientId: client.id, pageId, recipientId: userId, messageType: "text" }
              );
              await safelyRecordAiReply({
                clientId: client.id,
                pageId,
                recipientId: userId,
                reply,
                conversationSummary,
                customerState,
                recentMessages,
              });
              continue;
            }

            await safelyHandleFlowSend(
              async () => {
                console.info("AI webhook processing text message", {
                  clientId: client.id,
                  pageId,
                  userId,
                  preview: rawText.slice(0, 120),
                });
                const aiReply = await askAi(rawText, client.business_info || "", leadFields, {
                  ...aiConversationContext,
                  latestLeadIntent: leadIntent,
                  ...(replyPlan ? { replyPlan } : {}),
                });
                const customerState = inferCustomerState(
                  existingConversation?.customer_state,
                  rawText
                );
                const recentMessages = appendRecentConversationMessages(
                  existingConversation?.recent_messages,
                  rawText,
                  aiReply
                );
                const conversationSummary = updateConversationSummary(
                  existingConversation?.conversation_summary || "",
                  rawText,
                  aiReply
                );
                console.info("AI webhook generated reply", {
                  clientId: client.id,
                  pageId,
                  userId,
                  preview: aiReply.slice(0, 120),
                });
                await safeSendHumanTextReply(userId, aiReply, pageAccessToken, pageId, client.id);
                await safelyRecordAiReply({
                  clientId: client.id,
                  pageId,
                  recipientId: userId,
                  reply: aiReply,
                  conversationSummary,
                  customerState,
                  recentMessages,
                });
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

async function safeSendHumanTextReply(
  recipientId: string,
  text: string,
  pageToken: string,
  pageId = "unknown",
  clientId = "unknown"
) {
  await safeSendSenderAction(recipientId, "typing_on", pageToken);
  await sleep(getHumanReplyDelayMs(text));
  await safeSendSenderAction(recipientId, "typing_off", pageToken);

  return safeSendMessage(recipientId, text, pageToken, 0, pageId, clientId);
}

async function safeSendSenderAction(
  recipientId: string,
  senderAction: MessengerSenderActionBody["sender_action"],
  pageToken: string
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    await fetch(`${GRAPH_API_MESSAGES_URL}?access_token=${pageToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(createSenderActionBody(recipientId, senderAction)),
    });
  } catch (error) {
    console.warn("Messenger sender action failed", {
      recipientId,
      senderAction,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function safeSendImage(
  recipientId: string,
  attachmentId: string,
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
      body: JSON.stringify(createImageMessageBody(recipientId, attachmentId)),
    });
    clearTimeout(timeoutId);

    const appUsageRaw = res.headers.get("X-App-Usage") ?? "";
    const pageUsageRaw = res.headers.get("X-Page-Usage") ?? "";

    if (appUsageRaw || pageUsageRaw) {
      const usageSummary = getUsageSummary(res.headers);
      await handleUsageSummary(
        { clientId, pageId, recipientId, messageType: "image" },
        usageSummary
      );
      await logUsageSnapshot({
        clientId,
        pageId,
        recipientId,
        messageType: "image",
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
        console.error(`Image rate limit retry exhausted for user ${recipientId}`);
        await logSendFailure({
          clientId,
          pageId,
          recipientId,
          messageType: "image",
          statusCode: res.status,
          errorCode,
          errorSubcode: errorPayload?.error?.error_subcode,
          errorMessage: "Rate limit retry exhausted",
          payload: createImageMessageBody(recipientId, attachmentId),
        });
        return false;
      }

      const delay = withJitter(Math.pow(2, retryCount) * 1000);
      console.warn(`Image send rate limited. Retry ${retryCount + 1} in ${delay}ms`);
      await sleep(delay);
      return safeSendImage(recipientId, attachmentId, pageToken, retryCount + 1, pageId, clientId);
    }

    if (!res.ok) {
      const errorData = errorPayload ?? responseText;
      console.error("Image Send API error:", errorData);
      await logSendFailure({
        clientId,
        pageId,
        recipientId,
        messageType: "image",
        statusCode: res.status,
        errorCode,
        errorSubcode: errorPayload?.error?.error_subcode,
        errorMessage: typeof errorData === "string" ? errorData : JSON.stringify(errorData),
        payload: createImageMessageBody(recipientId, attachmentId),
      });
      return false;
    }

    return true;
  } catch (err) {
    clearTimeout(timeoutId);
    console.error("Network error in safeSendImage:", err);
    await logSendFailure({
      clientId,
      pageId,
      recipientId,
      messageType: "image",
      statusCode: 0,
      errorMessage: err instanceof Error ? err.message : "Unknown network error",
      payload: createImageMessageBody(recipientId, attachmentId),
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

function createSenderActionBody(
  recipientId: string,
  senderAction: MessengerSenderActionBody["sender_action"]
): MessengerSenderActionBody {
  return {
    recipient: { id: recipientId },
    sender_action: senderAction,
  };
}

function createImageMessageBody(recipientId: string, attachmentId: string): MessengerRequestBody {
  return {
    recipient: { id: recipientId },
    message: {
      attachment: {
        type: "image",
        payload: {
          attachment_id: attachmentId,
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

function sleep(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function getHumanReplyDelayMs(text: string) {
  const typedDelay = text.length * HUMAN_REPLY_MS_PER_CHAR;
  const baseDelay = Math.min(
    HUMAN_REPLY_MAX_DELAY_MS,
    Math.max(HUMAN_REPLY_MIN_DELAY_MS, typedDelay)
  );

  return withJitter(baseDelay);
}

function withJitter(durationMs: number) {
  const jitter = Math.round(durationMs * 0.25 * Math.random());
  return durationMs + jitter;
}

