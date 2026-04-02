import "server-only";

import { getSupabaseServerClient } from "./supabase";

type ClientRow = {
  id: string;
  client_name: string;
  page_id: string;
  page_access_token: string;
  created_at: string;
};

type FaqRow = {
  id: string;
  client_id: string;
  keywords: string[] | null;
  answer: string;
  image_attachment_id: string | null;
};

function normalizeClient(row: ClientRow) {
  return {
    id: row.id,
    client_name: row.client_name,
    page_id: row.page_id,
    page_access_token: row.page_access_token,
    created_at: row.created_at,
  };
}

function normalizeFaq(row: FaqRow) {
  return {
    id: row.id,
    client_id: row.client_id,
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    answer: row.answer,
    image_attachment_id: row.image_attachment_id ?? "",
  };
}

function getDb() {
  return getSupabaseServerClient();
}

export async function getClients() {
  const supabase = getDb();
  const { data, error } = await supabase
    .from("clients")
    .select("id, client_name, page_id, page_access_token, created_at")
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
    .insert(clientData)
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

export async function getFaqsForClient(clientId: string) {
  const supabase = getDb();
  const { data, error } = await supabase
    .from("faqs")
    .select("id, client_id, keywords, answer, image_attachment_id")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to load FAQs");
  }

  return (data ?? []).map((row) => {
    const faq = normalizeFaq(row as FaqRow);

    return {
      id: faq.id,
      keywords: faq.keywords,
      answer: faq.answer,
      image_attachment_id: faq.image_attachment_id,
    };
  });
}

export async function getFaqById(faqId: string) {
  const supabase = getDb();
  const { data, error } = await supabase
    .from("faqs")
    .select("id, client_id, keywords, answer, image_attachment_id")
    .eq("id", faqId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load FAQ");
  }

  if (!data) {
    return null;
  }

  return normalizeFaq(data as FaqRow);
}

export async function addFaq(
  clientId: string,
  keywords: string[],
  answer: string,
  image_attachment_id?: string
) {
  const supabase = getDb();
  const { data, error } = await supabase
    .from("faqs")
    .insert({
      client_id: clientId,
      keywords,
      answer,
      image_attachment_id: image_attachment_id || null,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message || "Failed to add FAQ");
  }

  return data.id;
}

export async function updateFaq(
  faqId: string,
  data: Partial<{
    keywords: string[];
    answer: string;
    image_attachment_id: string;
  }>
) {
  const updates: {
    keywords?: string[];
    answer?: string;
    image_attachment_id?: string | null;
  } = {};

  if (data.keywords) {
    updates.keywords = data.keywords;
  }

  if (data.answer) {
    updates.answer = data.answer;
  }

  if (data.image_attachment_id !== undefined) {
    updates.image_attachment_id = data.image_attachment_id || null;
  }

  const supabase = getDb();
  const { error } = await supabase.from("faqs").update(updates).eq("id", faqId);

  if (error) {
    throw new Error(error.message || "Failed to update FAQ");
  }
}

export async function deleteFaq(faqId: string) {
  const supabase = getDb();
  const { error } = await supabase.from("faqs").delete().eq("id", faqId);

  if (error) {
    throw new Error(error.message || "Failed to delete FAQ");
  }
}
