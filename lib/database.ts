import "server-only";

import { createHash } from "node:crypto";
import { getSupabaseServerClient } from "./supabase";

type ClientRow = {
  id: string;
  client_name: string;
  page_id: string;
  page_access_token: string;
  created_at: string;
  bot_type?: string | null;
  business_info?: string | null;
  ai_enabled?: boolean | null;
  google_sheets_webhook_url?: string | null;
  google_sheets_tab_name?: string | null;
  lead_capture_enabled?: boolean | null;
  lead_capture_fields?: string | null;
  lead_capture_trigger?: string | null;
  welcome_sequence_enabled?: boolean | null;
  welcome_message?: string | null;
  welcome_link_url?: string | null;
  welcome_image_urls?: string | null;
  manual_ai_pause_minutes?: number | null;
  auto_reply_ignore_pattern?: string | null;
};

type AiConversationRow = {
  id: string;
  client_id: string;
  page_id: string;
  recipient_id: string;
  last_customer_message: string | null;
  last_ai_reply?: string | null;
  conversation_summary?: string | null;
  customer_state?: Record<string, unknown> | null;
  recent_messages?: Array<{ role?: string; content?: string }> | null;
  welcome_sequence_sent?: boolean | null;
  last_message_at: string | null;
  ai_paused: boolean | null;
  paused_at: string | null;
  paused_by: string | null;
  ai_pause_expires_at?: string | null;
  resumed_at: string | null;
  created_at: string;
  updated_at: string;
};

type AiMessageJobRow = {
  id: string;
  source: string;
  body_hash: string;
  payload: unknown;
  status: string;
  attempts: number;
  max_attempts: number;
  locked_at: string | null;
  locked_by: string | null;
  next_attempt_at: string;
  last_error: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};

const CLIENT_COLUMNS =
  "id, client_name, page_id, page_access_token, created_at, bot_type, business_info, ai_enabled, google_sheets_webhook_url, google_sheets_tab_name, welcome_sequence_enabled, welcome_message, welcome_link_url, welcome_image_urls";
const CLIENT_COLUMNS_WITH_MANUAL_AI_PAUSE =
  `${CLIENT_COLUMNS}, manual_ai_pause_minutes`;
const CLIENT_COLUMNS_WITH_AUTO_REPLY_IGNORE =
  `${CLIENT_COLUMNS_WITH_MANUAL_AI_PAUSE}, auto_reply_ignore_pattern, lead_capture_enabled, lead_capture_fields`;
const CLIENT_COLUMNS_WITH_LEAD_TRIGGER =
  `${CLIENT_COLUMNS_WITH_AUTO_REPLY_IGNORE}, lead_capture_trigger`;
const LEGACY_CLIENT_COLUMNS =
  "id, client_name, page_id, page_access_token, created_at, bot_type, business_info, ai_enabled, google_sheets_webhook_url";
const AI_CONVERSATION_COLUMNS =
  "id, client_id, page_id, recipient_id, last_customer_message, last_ai_reply, conversation_summary, customer_state, recent_messages, welcome_sequence_sent, last_message_at, ai_paused, paused_at, paused_by, ai_pause_expires_at, resumed_at, created_at, updated_at";
const LEGACY_AI_CONVERSATION_COLUMNS =
  "id, client_id, page_id, recipient_id, last_customer_message, last_message_at, ai_paused, paused_at, paused_by, resumed_at, created_at, updated_at";

function buildPagePictureUrl(pageId: string) {
  return `https://graph.facebook.com/${encodeURIComponent(pageId)}/picture?type=large`;
}

function isMissingGoogleSheetsTabNameError(error: { message?: string } | null) {
  return Boolean(
    error?.message?.includes("google_sheets_tab_name") &&
      error.message.includes("does not exist")
  );
}

function isMissingLastAiReplyError(error: { message?: string } | null) {
  return Boolean(
    error?.message?.includes("last_ai_reply") &&
      error.message.includes("does not exist")
  );
}

function isMissingConversationMemoryError(error: { message?: string } | null) {
  return Boolean(
    (error?.message?.includes("conversation_summary") ||
      error?.message?.includes("customer_state") ||
      error?.message?.includes("recent_messages")) &&
      error.message.includes("does not exist")
  );
}

function isMissingWelcomeSequenceError(error: { message?: string } | null) {
  return Boolean(
    (error?.message?.includes("welcome_sequence_enabled") ||
      error?.message?.includes("welcome_message") ||
      error?.message?.includes("welcome_link_url") ||
      error?.message?.includes("welcome_image_urls") ||
      error?.message?.includes("welcome_sequence_sent")) &&
      error.message.includes("does not exist")
  );
}

function isMissingManualAiPauseMinutesError(error: { message?: string } | null) {
  return Boolean(
    error?.message?.includes("manual_ai_pause_minutes") &&
      error.message.includes("does not exist")
  );
}

function isMissingAutoReplyIgnorePatternError(error: { message?: string } | null) {
  return Boolean(
    error?.message?.includes("auto_reply_ignore_pattern") &&
      error.message.includes("does not exist")
  );
}

function isMissingAiPauseExpiresAtError(error: { message?: string } | null) {
  return Boolean(
    error?.message?.includes("ai_pause_expires_at") &&
      error.message.includes("does not exist")
  );
}

function isMissingLeadCaptureConfigError(error: { message?: string } | null) {
  return Boolean(
    (error?.message?.includes("lead_capture_enabled") || error?.message?.includes("lead_capture_fields")) &&
      error.message.includes("does not exist")
  );
}

function isMissingLeadCaptureTriggerError(error: { message?: string } | null) {
  return Boolean(
    error?.message?.includes("lead_capture_trigger") && error.message.includes("does not exist")
  );
}

function isMissingProcessedMessengerMessagesError(error: { message?: string } | null) {
  return Boolean(
    error?.message?.includes("processed_messenger_messages") &&
      error.message.includes("does not exist")
  );
}

function isMissingWelcomeSequenceRecipientsError(error: { message?: string } | null) {
  return Boolean(
    error?.message?.includes("welcome_sequence_recipients") &&
      (error.message.includes("does not exist") ||
        error.message.includes("schema cache"))
  );
}

function normalizeClient(row: ClientRow) {
  return {
    id: String(row.id),
    client_name: row.client_name,
    page_id: row.page_id,
    page_access_token: row.page_access_token,
    created_at: row.created_at,
    bot_type: "ai" as const,
    business_info: row.business_info ?? "",
    ai_enabled: row.ai_enabled ?? true,
    google_sheets_webhook_url: row.google_sheets_webhook_url ?? "",
    google_sheets_tab_name: row.google_sheets_tab_name ?? "Sheet1",
    welcome_sequence_enabled: row.welcome_sequence_enabled ?? false,
    welcome_message: row.welcome_message ?? "",
    welcome_link_url: row.welcome_link_url ?? "",
    welcome_image_urls: row.welcome_image_urls ?? "",
    manual_ai_pause_minutes: row.manual_ai_pause_minutes ?? 5,
    auto_reply_ignore_pattern: row.auto_reply_ignore_pattern ?? "",
    lead_capture_enabled: Boolean(row.lead_capture_enabled),
    lead_capture_fields: row.lead_capture_fields ?? "Full Name|name\nPhone|phone",
    lead_capture_trigger: row.lead_capture_trigger ?? "",
    picture_url: buildPagePictureUrl(row.page_id),
  };
}

function normalizeAiConversation(row: AiConversationRow) {
  const recentMessages = Array.isArray(row.recent_messages)
    ? row.recent_messages.flatMap((message) => {
        const role = message?.role === "user" || message?.role === "assistant"
          ? message.role
          : null;
        const content = typeof message?.content === "string" ? message.content : "";

        return role && content ? [{ role, content }] : [];
      })
    : [];

  return {
    id: String(row.id),
    client_id: String(row.client_id),
    page_id: row.page_id,
    recipient_id: row.recipient_id,
    last_customer_message: row.last_customer_message ?? "",
    last_ai_reply: row.last_ai_reply ?? "",
    conversation_summary: row.conversation_summary ?? "",
    customer_state: row.customer_state ?? {},
    recent_messages: recentMessages,
    welcome_sequence_sent: Boolean(row.welcome_sequence_sent),
    last_message_at: row.last_message_at ?? row.updated_at,
    ai_paused: Boolean(row.ai_paused),
    paused_at: row.paused_at ?? "",
    paused_by: row.paused_by ?? "",
    ai_pause_expires_at: row.ai_pause_expires_at ?? "",
    resumed_at: row.resumed_at ?? "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getDb() {
  return getSupabaseServerClient();
}

function normalizeAiMessageJob(row: AiMessageJobRow) {
  return {
    id: String(row.id),
    source: row.source,
    body_hash: row.body_hash,
    payload: row.payload,
    status: row.status,
    attempts: row.attempts,
    max_attempts: row.max_attempts,
    locked_at: row.locked_at ?? "",
    locked_by: row.locked_by ?? "",
    next_attempt_at: row.next_attempt_at,
    last_error: row.last_error ?? "",
    processed_at: row.processed_at ?? "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function createBodyHash(rawBody: string) {
  return createHash("sha256").update(rawBody).digest("hex");
}

export async function getClients() {
  const supabase = getDb();
  const response = await supabase
    .from("clients")
    .select(CLIENT_COLUMNS_WITH_LEAD_TRIGGER)
    .order("created_at", { ascending: true });
  const triggerResponse = isMissingLeadCaptureTriggerError(response.error)
    ? await supabase
        .from("clients")
        .select(CLIENT_COLUMNS_WITH_AUTO_REPLY_IGNORE)
        .order("created_at", { ascending: true })
    : response;
  const leadConfigResponse = isMissingLeadCaptureConfigError(triggerResponse.error)
    ? await supabase
        .from("clients")
        .select(CLIENT_COLUMNS_WITH_MANUAL_AI_PAUSE)
        .order("created_at", { ascending: true })
    : triggerResponse;
  const currentResponse = isMissingAutoReplyIgnorePatternError(leadConfigResponse.error)
    ? await supabase
        .from("clients")
        .select(CLIENT_COLUMNS_WITH_MANUAL_AI_PAUSE)
        .order("created_at", { ascending: true })
    : leadConfigResponse;
  const modernResponse = isMissingManualAiPauseMinutesError(currentResponse.error)
    ? await supabase
        .from("clients")
        .select(CLIENT_COLUMNS)
        .order("created_at", { ascending: true })
    : currentResponse;
  const { data, error } =
    isMissingGoogleSheetsTabNameError(modernResponse.error) ||
    isMissingWelcomeSequenceError(modernResponse.error)
    ? await supabase
        .from("clients")
        .select(LEGACY_CLIENT_COLUMNS)
        .order("created_at", { ascending: true })
    : modernResponse;

  if (error) {
    throw new Error(error.message || "Failed to load clients");
  }

  return (data ?? []).map((row) => normalizeClient(row as ClientRow));
}

export async function getClientByPageId(pageId: string) {
  const supabase = getDb();
  const response = await supabase
    .from("clients")
    .select(CLIENT_COLUMNS_WITH_LEAD_TRIGGER)
    .eq("page_id", pageId)
    .maybeSingle();
  const triggerResponse = isMissingLeadCaptureTriggerError(response.error)
    ? await supabase
        .from("clients")
        .select(CLIENT_COLUMNS_WITH_AUTO_REPLY_IGNORE)
        .eq("page_id", pageId)
        .maybeSingle()
    : response;
  const leadConfigResponse = isMissingLeadCaptureConfigError(triggerResponse.error)
    ? await supabase
        .from("clients")
        .select(CLIENT_COLUMNS_WITH_MANUAL_AI_PAUSE)
        .eq("page_id", pageId)
        .maybeSingle()
    : triggerResponse;
  const currentResponse = isMissingAutoReplyIgnorePatternError(leadConfigResponse.error)
    ? await supabase
        .from("clients")
        .select(CLIENT_COLUMNS_WITH_MANUAL_AI_PAUSE)
        .eq("page_id", pageId)
        .maybeSingle()
    : leadConfigResponse;
  const modernResponse = isMissingManualAiPauseMinutesError(currentResponse.error)
    ? await supabase
        .from("clients")
        .select(CLIENT_COLUMNS)
        .eq("page_id", pageId)
        .maybeSingle()
    : currentResponse;
  const { data, error } =
    isMissingGoogleSheetsTabNameError(modernResponse.error) ||
    isMissingWelcomeSequenceError(modernResponse.error)
    ? await supabase
        .from("clients")
        .select(LEGACY_CLIENT_COLUMNS)
        .eq("page_id", pageId)
        .maybeSingle()
    : modernResponse;

  if (error) {
    throw new Error(error.message || "Failed to load client by page ID");
  }

  return data ? normalizeClient(data as ClientRow) : null;
}

export async function enqueueAiMessageJob(input: {
  rawBody: string;
  payload: unknown;
  source?: string;
}) {
  const supabase = getDb();
  const bodyHash = createBodyHash(input.rawBody);
  const { data, error } = await supabase
    .from("ai_message_jobs")
    .upsert(
      {
        source: input.source ?? "messenger_webhook",
        body_hash: bodyHash,
        payload: input.payload,
        status: "queued",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "body_hash", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to enqueue AI message job");
  }

  return {
    id: data?.id ? String(data.id) : "",
    duplicate: !data?.id,
    bodyHash,
  };
}

export async function tryClaimMessengerMessage(input: {
  pageId: string;
  recipientId: string;
  messageId: string;
}) {
  const supabase = getDb();
  const eventKey = `${input.pageId}:${input.recipientId}:${input.messageId}`;
  const { data, error } = await supabase
    .from("processed_messenger_messages")
    .upsert(
      {
        event_key: eventKey,
        page_id: input.pageId,
        recipient_id: input.recipientId,
        message_id: input.messageId,
      },
      { onConflict: "event_key", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle();

  if (error) {
    if (isMissingProcessedMessengerMessagesError(error)) {
      console.warn(
        "processed_messenger_messages table is missing; Messenger message dedupe is inactive until the migration is run"
      );
      return true;
    }

    throw new Error(error.message || "Failed to claim Messenger message");
  }

  return Boolean(data?.id);
}

export async function releaseMessengerMessageClaim(input: {
  pageId: string;
  recipientId: string;
  messageId: string;
}) {
  const supabase = getDb();
  const eventKey = `${input.pageId}:${input.recipientId}:${input.messageId}`;
  const { error } = await supabase
    .from("processed_messenger_messages")
    .delete()
    .eq("event_key", eventKey);

  if (error) {
    if (isMissingProcessedMessengerMessagesError(error)) {
      return;
    }

    throw new Error(error.message || "Failed to release Messenger message claim");
  }
}

export async function claimAiMessageJobs(input: {
  batchSize: number;
  workerId: string;
}) {
  const supabase = getDb();
  const { data, error } = await supabase.rpc("claim_ai_message_jobs", {
    batch_size: input.batchSize,
    worker_id: input.workerId,
  });

  if (error) {
    throw new Error(error.message || "Failed to claim AI message jobs");
  }

  return ((data ?? []) as AiMessageJobRow[]).map(normalizeAiMessageJob);
}

export async function cancelPendingAiMessageJobsForConversation(input: {
  pageId: string;
  recipientId: string;
}) {
  const supabase = getDb();
  const { data, error } = await supabase.rpc("cancel_pending_ai_message_jobs", {
    target_page_id: input.pageId,
    target_recipient_id: input.recipientId,
  });

  if (error) {
    throw new Error(error.message || "Failed to cancel pending AI message jobs");
  }

  return typeof data === "number" ? data : 0;
}

export async function cleanupAiMessageJobs() {
  const supabase = getDb();
  const { data, error } = await supabase.rpc("cleanup_ai_message_jobs");

  if (error) {
    throw new Error(error.message || "Failed to clean up AI message jobs");
  }

  return typeof data === "number" ? data : 0;
}

export async function cleanupProcessedMessengerMessages(cutoffIso: string) {
  const supabase = getDb();
  const { count, error: countError } = await supabase
    .from("processed_messenger_messages")
    .select("*", { count: "exact", head: true })
    .lt("created_at", cutoffIso);

  if (countError) {
    throw new Error(countError.message || "Failed to count processed Messenger messages");
  }

  const { error } = await supabase
    .from("processed_messenger_messages")
    .delete()
    .lt("created_at", cutoffIso);

  if (error) {
    throw new Error(error.message || "Failed to clean up processed Messenger messages");
  }

  return count ?? 0;
}

export async function completeAiMessageJob(jobId: string) {
  const supabase = getDb();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("ai_message_jobs")
    .update({
      status: "sent",
      processed_at: now,
      locked_at: null,
      locked_by: null,
      updated_at: now,
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(error.message || "Failed to complete AI message job");
  }
}

export async function failAiMessageJob(input: {
  jobId: string;
  errorMessage: string;
  attempts: number;
  maxAttempts: number;
}) {
  const supabase = getDb();
  const now = new Date().toISOString();
  const retryDelaySeconds = Math.min(300, Math.pow(2, Math.max(0, input.attempts - 1)) * 10);
  const shouldRetry = input.attempts < input.maxAttempts;
  const { error } = await supabase
    .from("ai_message_jobs")
    .update({
      status: shouldRetry ? "retrying" : "failed",
      last_error: input.errorMessage.slice(0, 1000),
      next_attempt_at: new Date(Date.now() + retryDelaySeconds * 1000).toISOString(),
      locked_at: null,
      locked_by: null,
      updated_at: now,
    })
    .eq("id", input.jobId);

  if (error) {
    throw new Error(error.message || "Failed to fail AI message job");
  }
}

export async function addClient(clientData: {
  client_name: string;
  page_id: string;
  page_access_token: string;
}) {
  const supabase = getDb();
  const { data, error } = await supabase
    .from("clients")
    .insert({ ...clientData, bot_type: "ai" })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message || "Failed to add client");
  }

  return data.id;
}

export async function refreshClientPageToken(input: {
  clientId: string;
  pageAccessToken: string;
}) {
  const supabase = getDb();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("clients")
    .update({
      page_access_token: input.pageAccessToken,
      created_at: now,
    })
    .eq("id", input.clientId);

  if (error) {
    throw new Error(error.message || "Failed to refresh page token");
  }
}

export async function deleteClientByPageId(pageId: string) {
  const supabase = getDb();
  const { error } = await supabase.from("clients").delete().eq("page_id", pageId);

  if (error) {
    throw new Error(error.message || "Failed to delete client");
  }
}

export async function deleteClientById(clientId: string) {
  const supabase = getDb();
  const { error } = await supabase.from("clients").delete().eq("id", clientId);

  if (error) {
    throw new Error(error.message || "Failed to delete client");
  }
}

export async function getClientById(clientId: string) {
  const supabase = getDb();
  const response = await supabase
    .from("clients")
    .select(CLIENT_COLUMNS_WITH_LEAD_TRIGGER)
    .eq("id", clientId)
    .maybeSingle();
  const triggerResponse = isMissingLeadCaptureTriggerError(response.error)
    ? await supabase
        .from("clients")
        .select(CLIENT_COLUMNS_WITH_AUTO_REPLY_IGNORE)
        .eq("id", clientId)
        .maybeSingle()
    : response;
  const leadConfigResponse = isMissingLeadCaptureConfigError(triggerResponse.error)
    ? await supabase
        .from("clients")
        .select(CLIENT_COLUMNS_WITH_MANUAL_AI_PAUSE)
        .eq("id", clientId)
        .maybeSingle()
    : triggerResponse;
  const currentResponse = isMissingAutoReplyIgnorePatternError(leadConfigResponse.error)
    ? await supabase
        .from("clients")
        .select(CLIENT_COLUMNS_WITH_MANUAL_AI_PAUSE)
        .eq("id", clientId)
        .maybeSingle()
    : leadConfigResponse;
  const modernResponse = isMissingManualAiPauseMinutesError(currentResponse.error)
    ? await supabase
        .from("clients")
        .select(CLIENT_COLUMNS)
        .eq("id", clientId)
        .maybeSingle()
    : currentResponse;
  const { data, error } =
    isMissingGoogleSheetsTabNameError(modernResponse.error) ||
    isMissingWelcomeSequenceError(modernResponse.error)
    ? await supabase
        .from("clients")
        .select(LEGACY_CLIENT_COLUMNS)
        .eq("id", clientId)
        .maybeSingle()
    : modernResponse;

  if (error) {
    throw new Error(error.message || "Failed to load client");
  }

  if (!data) {
    return null;
  }

  return normalizeClient(data as ClientRow);
}

export async function updateClientSettings(
  clientId: string,
  updates: Partial<{
    bot_type: "ai";
    business_info: string;
    ai_enabled: boolean;
    google_sheets_webhook_url: string;
    google_sheets_tab_name: string;
    welcome_sequence_enabled: boolean;
    welcome_message: string;
    welcome_link_url: string;
    welcome_image_urls: string;
    manual_ai_pause_minutes: number;
    auto_reply_ignore_pattern: string;
    lead_capture_enabled: boolean;
    lead_capture_fields: string;
    lead_capture_trigger: string;
  }>
) {
  const supabase = getDb();
  const { error } = await supabase.from("clients").update(updates).eq("id", clientId);

  if (error) {
    throw new Error(error.message || "Failed to update client settings");
  }
}

export async function getAiConversationsForClient(clientId: string) {
  const supabase = getDb();
  const response = await supabase
    .from("ai_conversations")
    .select(AI_CONVERSATION_COLUMNS)
    .eq("client_id", clientId)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  const { data, error } =
    isMissingLastAiReplyError(response.error) ||
    isMissingConversationMemoryError(response.error) ||
    isMissingWelcomeSequenceError(response.error) ||
    isMissingAiPauseExpiresAtError(response.error)
    ? await supabase
        .from("ai_conversations")
        .select(LEGACY_AI_CONVERSATION_COLUMNS)
        .eq("client_id", clientId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
    : response;

  if (error) {
    throw new Error(error.message || "Failed to load conversations");
  }

  return (data ?? []).map((row) => normalizeAiConversation(row as AiConversationRow));
}

export async function getAiConversation(clientId: string, recipientId: string) {
  const supabase = getDb();
  const response = await supabase
    .from("ai_conversations")
    .select(AI_CONVERSATION_COLUMNS)
    .eq("client_id", clientId)
    .eq("recipient_id", recipientId)
    .maybeSingle();
  const { data, error } =
    isMissingLastAiReplyError(response.error) ||
    isMissingConversationMemoryError(response.error) ||
    isMissingWelcomeSequenceError(response.error) ||
    isMissingAiPauseExpiresAtError(response.error)
    ? await supabase
        .from("ai_conversations")
        .select(LEGACY_AI_CONVERSATION_COLUMNS)
        .eq("client_id", clientId)
        .eq("recipient_id", recipientId)
        .maybeSingle()
    : response;

  if (error) {
    throw new Error(error.message || "Failed to load conversation");
  }

  return data ? normalizeAiConversation(data as AiConversationRow) : null;
}

export async function recordCustomerConversationMessage(input: {
  clientId: string;
  pageId: string;
  recipientId: string;
  message: string;
}) {
  const now = new Date().toISOString();
  const supabase = getDb();
  const { error } = await supabase.from("ai_conversations").upsert(
    {
      client_id: input.clientId,
      page_id: input.pageId,
      recipient_id: input.recipientId,
      last_customer_message: input.message,
      last_message_at: now,
      updated_at: now,
    },
    { onConflict: "client_id,recipient_id" }
  );

  if (error) {
    throw new Error(error.message || "Failed to record conversation");
  }
}

export type LeadRecord = {
  id: string;
  client_id: string;
  page_id: string;
  recipient_id: string;
  fields: Record<string, string>;
  field_config: Array<{ label: string; type: string }>;
  status: "collecting" | "awaiting_confirmation" | "confirmed" | "delivered" | "delivery_failed";
  delivery_attempts: number;
  last_delivery_error: string;
  confirmed_at: string;
  delivered_at: string;
  created_at: string;
  updated_at: string;
};

function normalizeLeadRecord(row: Record<string, unknown>): LeadRecord {
  const fields = row.fields && typeof row.fields === "object" && !Array.isArray(row.fields)
    ? Object.fromEntries(Object.entries(row.fields as Record<string, unknown>).flatMap(([key, value]) =>
        typeof value === "string" ? [[key, value]] : []
      ))
    : {};
  const fieldConfig = Array.isArray(row.field_config)
    ? row.field_config.flatMap((field) => {
        if (!field || typeof field !== "object") return [];
        const value = field as Record<string, unknown>;
        return typeof value.label === "string" && typeof value.type === "string"
          ? [{ label: value.label, type: value.type }]
          : [];
      })
    : [];
  return {
    id: String(row.id), client_id: String(row.client_id), page_id: String(row.page_id),
    recipient_id: String(row.recipient_id), fields, field_config: fieldConfig,
    status: (typeof row.status === "string" ? row.status : "collecting") as LeadRecord["status"],
    delivery_attempts: Number(row.delivery_attempts) || 0,
    last_delivery_error: typeof row.last_delivery_error === "string" ? row.last_delivery_error : "",
    confirmed_at: typeof row.confirmed_at === "string" ? row.confirmed_at : "",
    delivered_at: typeof row.delivered_at === "string" ? row.delivered_at : "",
    created_at: String(row.created_at), updated_at: String(row.updated_at),
  };
}

export async function getOpenLeadRecord(clientId: string, recipientId: string) {
  const { data, error } = await getDb().from("lead_records")
    .select("*").eq("client_id", clientId).eq("recipient_id", recipientId)
    .in("status", ["collecting", "awaiting_confirmation"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message || "Failed to load lead record");
  return data ? normalizeLeadRecord(data as Record<string, unknown>) : null;
}

export async function createLeadRecord(input: {
  clientId: string; pageId: string; recipientId: string;
  fields: Record<string, string>; fieldConfig: Array<{ label: string; type: string }>;
  status?: LeadRecord["status"];
}) {
  const { data, error } = await getDb().from("lead_records").insert({
    client_id: input.clientId, page_id: input.pageId, recipient_id: input.recipientId,
    fields: input.fields, field_config: input.fieldConfig, status: input.status ?? "collecting",
  }).select("*").single();
  if (error) throw new Error(error.message || "Failed to create lead record");
  return normalizeLeadRecord(data as Record<string, unknown>);
}

export async function updateLeadRecord(id: string, updates: {
  fields?: Record<string, string>; status?: LeadRecord["status"]; confirmed_at?: string | null;
  delivered_at?: string | null; delivery_attempts?: number; last_delivery_error?: string;
}) {
  const { data, error } = await getDb().from("lead_records")
    .update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
  if (error) throw new Error(error.message || "Failed to update lead record");
  return normalizeLeadRecord(data as Record<string, unknown>);
}

export async function getLeadDeliverySummary(clientId: string) {
  const { data, error } = await getDb().from("lead_records")
    .select("status").eq("client_id", clientId).gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString());
  if (error) {
    if (error.message.includes("lead_records") && error.message.includes("does not exist")) {
      return { delivered: 0, failed: 0, pending: 0 };
    }
    throw new Error(error.message || "Failed to load lead delivery status");
  }
  return (data ?? []).reduce((summary, row) => {
    const status = typeof row.status === "string" ? row.status : "";
    if (status === "delivered") summary.delivered += 1;
    else if (status === "delivery_failed") summary.failed += 1;
    else if (status === "confirmed") summary.pending += 1;
    return summary;
  }, { delivered: 0, failed: 0, pending: 0 });
}

export async function getLeadRecordsNeedingDelivery(limit = 25) {
  const { data, error } = await getDb().from("lead_records")
    .select("*, clients!inner(google_sheets_webhook_url, google_sheets_tab_name)")
    .in("status", ["confirmed", "delivery_failed"])
    .order("updated_at", { ascending: true }).limit(limit);
  if (error) {
    if (error.message.includes("lead_records") && error.message.includes("does not exist")) return [];
    throw new Error(error.message || "Failed to load pending lead deliveries");
  }
  return (data ?? []).map((row) => {
    const record = normalizeLeadRecord(row as Record<string, unknown>);
    const client = (row as { clients?: unknown }).clients;
    const settings = client && typeof client === "object" ? client as Record<string, unknown> : {};
    return {
      ...record,
      google_sheets_webhook_url: typeof settings.google_sheets_webhook_url === "string" ? settings.google_sheets_webhook_url : "",
      google_sheets_tab_name: typeof settings.google_sheets_tab_name === "string" ? settings.google_sheets_tab_name : "Sheet1",
    };
  });
}

export async function recordWelcomeSequenceCandidate(input: {
  clientId: string;
  pageId: string;
  recipientId: string;
}) {
  const now = new Date().toISOString();
  const supabase = getDb();
  const { error } = await supabase.from("ai_conversations").upsert(
    {
      client_id: input.clientId,
      page_id: input.pageId,
      recipient_id: input.recipientId,
      last_message_at: now,
      updated_at: now,
    },
    { onConflict: "client_id,recipient_id" }
  );

  if (error) {
    throw new Error(error.message || "Failed to record welcome sequence candidate");
  }
}

export async function hasWelcomeSequenceReceipt(input: {
  clientId: string;
  recipientId: string;
}) {
  const supabase = getDb();
  const { data, error } = await supabase
    .from("welcome_sequence_recipients")
    .select("recipient_id")
    .eq("client_id", input.clientId)
    .eq("recipient_id", input.recipientId)
    .maybeSingle();

  if (isMissingWelcomeSequenceRecipientsError(error)) {
    return false;
  }

  if (error) {
    throw new Error(error.message || "Failed to load welcome sequence receipt");
  }

  return Boolean(data);
}

export async function recordWelcomeSequenceSent(input: {
  clientId: string;
  pageId: string;
  recipientId: string;
}) {
  const now = new Date().toISOString();
  const supabase = getDb();
  const response = await supabase.from("ai_conversations").upsert(
    {
      client_id: input.clientId,
      page_id: input.pageId,
      recipient_id: input.recipientId,
      welcome_sequence_sent: true,
      last_message_at: now,
      updated_at: now,
    },
    { onConflict: "client_id,recipient_id" }
  );
  const { error } = isMissingWelcomeSequenceError(response.error)
    ? await supabase.from("ai_conversations").upsert(
        {
          client_id: input.clientId,
          page_id: input.pageId,
          recipient_id: input.recipientId,
          last_message_at: now,
          updated_at: now,
        },
        { onConflict: "client_id,recipient_id" }
      )
    : response;

  if (error) {
    throw new Error(error.message || "Failed to record welcome sequence");
  }

  const receiptResponse = await supabase.from("welcome_sequence_recipients").upsert(
    {
      client_id: input.clientId,
      page_id: input.pageId,
      recipient_id: input.recipientId,
      updated_at: now,
    },
    { onConflict: "client_id,recipient_id" }
  );

  if (
    receiptResponse.error &&
    !isMissingWelcomeSequenceRecipientsError(receiptResponse.error)
  ) {
    throw new Error(
      receiptResponse.error.message || "Failed to record welcome sequence receipt"
    );
  }
}

export async function recordAiConversationReply(input: {
  clientId: string;
  pageId: string;
  recipientId: string;
  reply: string;
  conversationSummary?: string;
  customerState?: Record<string, unknown>;
  recentMessages?: Array<{ role: string; content: string }>;
}) {
  const now = new Date().toISOString();
  const supabase = getDb();
  const updates: Record<string, unknown> = {
    client_id: input.clientId,
    page_id: input.pageId,
    recipient_id: input.recipientId,
    last_ai_reply: input.reply,
    last_message_at: now,
    updated_at: now,
  };

  if (input.conversationSummary !== undefined) {
    updates.conversation_summary = input.conversationSummary;
  }

  if (input.customerState !== undefined) {
    updates.customer_state = input.customerState;
  }

  if (input.recentMessages !== undefined) {
    updates.recent_messages = input.recentMessages;
  }

  const response = await supabase.from("ai_conversations").upsert(
    updates,
    { onConflict: "client_id,recipient_id" }
  );
  const shouldFallback =
    isMissingLastAiReplyError(response.error) ||
    isMissingConversationMemoryError(response.error) ||
    isMissingWelcomeSequenceError(response.error);
  const fallbackUpdates: Record<string, unknown> = {
    client_id: input.clientId,
    page_id: input.pageId,
    recipient_id: input.recipientId,
    last_message_at: now,
    updated_at: now,
  };

  if (!isMissingLastAiReplyError(response.error)) {
    fallbackUpdates.last_ai_reply = input.reply;
  }

  const { error } = shouldFallback
    ? await supabase.from("ai_conversations").upsert(
        fallbackUpdates,
        { onConflict: "client_id,recipient_id" }
      )
    : response;

  if (error) {
    throw new Error(error.message || "Failed to record AI reply");
  }
}

export async function pauseAiConversation(input: {
  clientId: string;
  pageId: string;
  recipientId: string;
  pausedBy: "owner" | "admin";
  pauseExpiresAt?: string | null;
}) {
  const now = new Date().toISOString();
  const supabase = getDb();
  const updates = {
    client_id: input.clientId,
    page_id: input.pageId,
    recipient_id: input.recipientId,
    ai_paused: true,
    paused_at: now,
    paused_by: input.pausedBy,
    ai_pause_expires_at: input.pauseExpiresAt ?? null,
    updated_at: now,
  };
  const response = await supabase.from("ai_conversations").upsert(
    updates,
    { onConflict: "client_id,recipient_id" }
  );
  const { error } = isMissingAiPauseExpiresAtError(response.error)
    ? await supabase.from("ai_conversations").upsert(
        {
          client_id: input.clientId,
          page_id: input.pageId,
          recipient_id: input.recipientId,
          ai_paused: true,
          paused_at: now,
          paused_by: input.pausedBy,
          updated_at: now,
        },
        { onConflict: "client_id,recipient_id" }
      )
    : response;

  if (error) {
    throw new Error(error.message || "Failed to pause AI conversation");
  }
}

export async function resumeAiConversation(clientId: string, recipientId: string) {
  const now = new Date().toISOString();
  const supabase = getDb();
  const response = await supabase
    .from("ai_conversations")
    .update({
      ai_paused: false,
      paused_by: null,
      ai_pause_expires_at: null,
      resumed_at: now,
      updated_at: now,
    })
    .eq("client_id", clientId)
    .eq("recipient_id", recipientId);
  const { error } = isMissingAiPauseExpiresAtError(response.error)
    ? await supabase
        .from("ai_conversations")
        .update({
          ai_paused: false,
          paused_by: null,
          resumed_at: now,
          updated_at: now,
        })
        .eq("client_id", clientId)
        .eq("recipient_id", recipientId)
    : response;

  if (error) {
    throw new Error(error.message || "Failed to resume AI conversation");
  }
}

export async function resumeAllAiConversationsForClient(clientId: string) {
  const now = new Date().toISOString();
  const supabase = getDb();
  const response = await supabase
    .from("ai_conversations")
    .update({
      ai_paused: false,
      paused_by: null,
      ai_pause_expires_at: null,
      resumed_at: now,
      updated_at: now,
    })
    .eq("client_id", clientId)
    .eq("ai_paused", true);
  const { error } = isMissingAiPauseExpiresAtError(response.error)
    ? await supabase
        .from("ai_conversations")
        .update({
          ai_paused: false,
          paused_by: null,
          resumed_at: now,
          updated_at: now,
        })
        .eq("client_id", clientId)
        .eq("ai_paused", true)
    : response;

  if (error) {
    throw new Error(error.message || "Failed to resume all AI conversations");
  }
}

