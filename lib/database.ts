import "server-only";

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
  ai_character?: string | null;
  ai_tone?: string | null;
  google_sheets_webhook_url?: string | null;
  google_sheets_tab_name?: string | null;
  lead_capture_fields?: string | null;
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

const CLIENT_COLUMNS =
  "id, client_name, page_id, page_access_token, created_at, bot_type, business_info, ai_enabled, ai_character, ai_tone, google_sheets_webhook_url, google_sheets_tab_name, lead_capture_fields, welcome_sequence_enabled, welcome_message, welcome_link_url, welcome_image_urls";
const CLIENT_COLUMNS_WITH_MANUAL_AI_PAUSE =
  `${CLIENT_COLUMNS}, manual_ai_pause_minutes`;
const CLIENT_COLUMNS_WITH_AUTO_REPLY_IGNORE =
  `${CLIENT_COLUMNS_WITH_MANUAL_AI_PAUSE}, auto_reply_ignore_pattern`;
const LEGACY_CLIENT_COLUMNS =
  "id, client_name, page_id, page_access_token, created_at, bot_type, business_info, ai_enabled, google_sheets_webhook_url, lead_capture_fields";
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

function isMissingNewClientAiFieldsError(error: { message?: string } | null) {
  return Boolean(
    (error?.message?.includes("ai_character") ||
      error?.message?.includes("ai_tone")) &&
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
    ai_character: row.ai_character ?? "",
    ai_tone: row.ai_tone ?? "",
    google_sheets_webhook_url: row.google_sheets_webhook_url ?? "",
    google_sheets_tab_name: row.google_sheets_tab_name ?? "Sheet1",
    lead_capture_fields: row.lead_capture_fields ?? "Full Name\nPhone",
    welcome_sequence_enabled: row.welcome_sequence_enabled ?? false,
    welcome_message: row.welcome_message ?? "",
    welcome_link_url: row.welcome_link_url ?? "",
    welcome_image_urls: row.welcome_image_urls ?? "",
    manual_ai_pause_minutes: row.manual_ai_pause_minutes ?? 5,
    auto_reply_ignore_pattern: row.auto_reply_ignore_pattern ?? "",
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

export async function getClients() {
  const supabase = getDb();
  const response = await supabase
    .from("clients")
    .select(CLIENT_COLUMNS_WITH_AUTO_REPLY_IGNORE)
    .order("created_at", { ascending: true });
  const currentResponse = isMissingAutoReplyIgnorePatternError(response.error)
    ? await supabase
        .from("clients")
        .select(CLIENT_COLUMNS_WITH_MANUAL_AI_PAUSE)
        .order("created_at", { ascending: true })
    : response;
  const modernResponse = isMissingManualAiPauseMinutesError(currentResponse.error)
    ? await supabase
        .from("clients")
        .select(CLIENT_COLUMNS)
        .order("created_at", { ascending: true })
    : currentResponse;
  const { data, error } =
    isMissingGoogleSheetsTabNameError(modernResponse.error) ||
    isMissingNewClientAiFieldsError(modernResponse.error) ||
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
    .select(CLIENT_COLUMNS_WITH_AUTO_REPLY_IGNORE)
    .eq("id", clientId)
    .maybeSingle();
  const currentResponse = isMissingAutoReplyIgnorePatternError(response.error)
    ? await supabase
        .from("clients")
        .select(CLIENT_COLUMNS_WITH_MANUAL_AI_PAUSE)
        .eq("id", clientId)
        .maybeSingle()
    : response;
  const modernResponse = isMissingManualAiPauseMinutesError(currentResponse.error)
    ? await supabase
        .from("clients")
        .select(CLIENT_COLUMNS)
        .eq("id", clientId)
        .maybeSingle()
    : currentResponse;
  const { data, error } =
    isMissingGoogleSheetsTabNameError(modernResponse.error) ||
    isMissingNewClientAiFieldsError(modernResponse.error) ||
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
    ai_character: string;
    ai_tone: string;
    google_sheets_webhook_url: string;
    google_sheets_tab_name: string;
    lead_capture_fields: string;
    welcome_sequence_enabled: boolean;
    welcome_message: string;
    welcome_link_url: string;
    welcome_image_urls: string;
    manual_ai_pause_minutes: number;
    auto_reply_ignore_pattern: string;
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

