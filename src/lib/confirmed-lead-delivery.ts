export type ConfirmedLeadField = {
  label: string;
  type: string;
};

type ConfirmedLeadPayloadInput = {
  leadId: string;
  pageId: string;
  recipientId: string;
  capturedAt: string;
  sheetTab: string;
  fields: Record<string, string>;
  fieldConfig: ConfirmedLeadField[];
};

export type LeadWebhookDestination = {
  url: string;
  name: string;
  authorization?: string;
};

function getHuswellLeadWebhookDestination(): LeadWebhookDestination | null {
  const url = process.env.HUSWELL_LEAD_WEBHOOK_URL?.trim() ?? "";
  const secret = process.env.HUSWELL_LEAD_WEBHOOK_SECRET?.trim() ?? "";

  if (!url && !secret) return null;
  if (!url || !secret) {
    throw new Error("Huswell lead delivery requires both HUSWELL_LEAD_WEBHOOK_URL and HUSWELL_LEAD_WEBHOOK_SECRET.");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("HUSWELL_LEAD_WEBHOOK_URL is invalid.");
  }

  const isLocalDevelopmentUrl = parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !isLocalDevelopmentUrl) {
    throw new Error("HUSWELL_LEAD_WEBHOOK_URL must use HTTPS outside local development.");
  }

  return { url: parsed.toString(), name: "Huswell", authorization: `Bearer ${secret}` };
}

export function resolveConfirmedLeadDestination(fallbackUrl: string): LeadWebhookDestination | null {
  const huswellDestination = getHuswellLeadWebhookDestination();
  if (huswellDestination) return huswellDestination;

  const googleSheetsUrl = fallbackUrl.trim();
  return googleSheetsUrl ? { url: googleSheetsUrl, name: "Google Sheets" } : null;
}

export function createConfirmedLeadPayload(input: ConfirmedLeadPayloadInput) {
  const fields = Object.fromEntries(input.fieldConfig.map((field) => [field.label, input.fields[field.label] ?? ""]));
  const contactName = getMappedFieldValue(input, (field) =>
    field.type === "name" || /(?:^|\s)(?:full\s+|client'?s?\s+|contact\s+)?name(?:\s|$)/i.test(field.label)
  );
  const email = getMappedFieldValue(input, (field) => field.type === "email" || /email/i.test(field.label));
  const phone = getMappedFieldValue(input, (field) =>
    field.type === "phone" || /(?:phone|mobile|viber|whatsapp|contact number)/i.test(field.label)
  );

  return {
    leadId: input.leadId,
    pageId: input.pageId,
    recipientId: input.recipientId,
    capturedAt: input.capturedAt,
    sheetTab: input.sheetTab,
    // Huswell validates these top-level fields. Keep the original generic
    // field map too, so Google Sheets and custom destinations remain supported.
    contactName,
    name: contactName,
    email,
    phone,
    fields,
    fieldTypes: Object.fromEntries(input.fieldConfig.map((field) => [field.label, field.type])),
  };
}

function getMappedFieldValue(input: ConfirmedLeadPayloadInput, matches: (field: ConfirmedLeadField) => boolean) {
  const field = input.fieldConfig.find(matches);
  return field ? (input.fields[field.label] ?? "").trim() : "";
}
