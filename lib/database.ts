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
};

type AiConversationRow = {
  id: string;
  client_id: string;
  page_id: string;
  recipient_id: string;
  last_customer_message: string | null;
  last_message_at: string | null;
  ai_paused: boolean | null;
  paused_at: string | null;
  paused_by: string | null;
  resumed_at: string | null;
  created_at: string;
  updated_at: string;
};

type BusinessUserRow = {
  id: string;
  client_id: string;
  email: string;
  role: string | null;
  created_at: string;
};

type OrderRow = {
  id: string;
  client_id: string;
  page_id: string;
  recipient_id: string;
  customer_name: string | null;
  contact_number: string | null;
  order_summary: string;
  status: string;
  total_amount: number | null;
  payment_method: string | null;
  delivery_method: string | null;
  delivery_address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function buildPagePictureUrl(pageId: string) {
  return `https://graph.facebook.com/${encodeURIComponent(pageId)}/picture?type=large`;
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
    picture_url: buildPagePictureUrl(row.page_id),
  };
}

function normalizeAiConversation(row: AiConversationRow) {
  return {
    id: String(row.id),
    client_id: String(row.client_id),
    page_id: row.page_id,
    recipient_id: row.recipient_id,
    last_customer_message: row.last_customer_message ?? "",
    last_message_at: row.last_message_at ?? row.updated_at,
    ai_paused: Boolean(row.ai_paused),
    paused_at: row.paused_at ?? "",
    paused_by: row.paused_by ?? "",
    resumed_at: row.resumed_at ?? "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeBusinessUser(row: BusinessUserRow) {
  return {
    id: String(row.id),
    client_id: String(row.client_id),
    email: row.email.trim().toLowerCase(),
    role: row.role || "owner",
    created_at: row.created_at,
  };
}

function normalizeOrder(row: OrderRow) {
  return {
    id: String(row.id),
    client_id: String(row.client_id),
    page_id: row.page_id,
    recipient_id: row.recipient_id,
    customer_name: row.customer_name ?? "",
    contact_number: row.contact_number ?? "",
    order_summary: row.order_summary,
    status: row.status,
    total_amount: row.total_amount,
    payment_method: row.payment_method ?? "",
    delivery_method: row.delivery_method ?? "",
    delivery_address: row.delivery_address ?? "",
    notes: row.notes ?? "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function getDb() {
  return getSupabaseServerClient();
}

export async function getClients() {
  const supabase = getDb();
  const { data, error } = await supabase
    .from("clients")
    .select("id, client_name, page_id, page_access_token, created_at, bot_type, business_info")
    .order("created_at", { ascending: true });

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
  const { data, error } = await supabase
    .from("clients")
    .select("id, client_name, page_id, page_access_token, created_at, bot_type, business_info")
    .eq("id", clientId)
    .maybeSingle();

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
  const { data, error } = await supabase
    .from("ai_conversations")
    .select(
      "id, client_id, page_id, recipient_id, last_customer_message, last_message_at, ai_paused, paused_at, paused_by, resumed_at, created_at, updated_at"
    )
    .eq("client_id", clientId)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) {
    throw new Error(error.message || "Failed to load conversations");
  }

  return (data ?? []).map((row) => normalizeAiConversation(row as AiConversationRow));
}

export async function getAiConversation(clientId: string, recipientId: string) {
  const supabase = getDb();
  const { data, error } = await supabase
    .from("ai_conversations")
    .select(
      "id, client_id, page_id, recipient_id, last_customer_message, last_message_at, ai_paused, paused_at, paused_by, resumed_at, created_at, updated_at"
    )
    .eq("client_id", clientId)
    .eq("recipient_id", recipientId)
    .maybeSingle();

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

export async function pauseAiConversation(input: {
  clientId: string;
  pageId: string;
  recipientId: string;
  pausedBy: "owner" | "admin";
}) {
  const now = new Date().toISOString();
  const supabase = getDb();
  const { error } = await supabase.from("ai_conversations").upsert(
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
  );

  if (error) {
    throw new Error(error.message || "Failed to pause AI conversation");
  }
}

export async function resumeAiConversation(clientId: string, recipientId: string) {
  const now = new Date().toISOString();
  const supabase = getDb();
  const { error } = await supabase
    .from("ai_conversations")
    .update({
      ai_paused: false,
      paused_by: null,
      resumed_at: now,
      updated_at: now,
    })
    .eq("client_id", clientId)
    .eq("recipient_id", recipientId);

  if (error) {
    throw new Error(error.message || "Failed to resume AI conversation");
  }
}

export async function getBusinessUserByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  const supabase = getDb();
  const { data, error } = await supabase
    .from("business_users")
    .select("id, client_id, email, role, created_at")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load business user");
  }

  return data ? normalizeBusinessUser(data as BusinessUserRow) : null;
}

export async function getOrdersForClient(clientId: string) {
  const supabase = getDb();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, client_id, page_id, recipient_id, customer_name, contact_number, order_summary, status, total_amount, payment_method, delivery_method, delivery_address, notes, created_at, updated_at"
    )
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Failed to load orders");
  }

  return (data ?? []).map((row) => normalizeOrder(row as OrderRow));
}
