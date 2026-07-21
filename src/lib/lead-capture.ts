import "server-only";

const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{7,}\d)/;
const NAME_PATTERNS = [
  /\b(?:my name is|name is|full name is|i am|i'm|im)\s+([a-z][a-z\s.'-]{2,80})/i,
  /\b(?:name|full name)\s*[:\-]\s*([a-z][a-z\s.'-]{2,80})/i,
  /\b(?:ako si|pangalan ko ay|pangalan ko)\s+([a-z][a-z\s.'-]{2,80})/i,
];

export type CapturedLead = {
  fullName: string;
  phone: string;
  fields: Record<string, string>;
};

const DEFAULT_LEAD_FIELDS = ["Full Name", "Phone"];

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "").trim();
}

function normalizeName(value: string) {
  return value
    .replace(PHONE_PATTERN, "")
    .replace(
      /\b(?:and\s+)?(?:my\s+)?(?:phone|number|contact|mobile|cell|cp|tel|email|budget|schedule|date|time|address)\b.*$/i,
      ""
    )
    .replace(/\b(?:and|phone|number|contact|mobile|cell|cp|tel|email|budget)\s*$/i, "")
    .replace(/[^\p{L}\s.'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeFullName(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.every((word) => /\p{L}/u.test(word));
}

function extractNameFromMessage(message: string) {
  for (const pattern of NAME_PATTERNS) {
    const match = message.match(pattern);
    const candidate = match?.[1] ? normalizeName(match[1]) : "";

    if (candidate && looksLikeFullName(candidate)) {
      return candidate;
    }
  }

  const beforePhone = message.split(PHONE_PATTERN)[0] ?? "";
  const fallbackName = normalizeName(
    beforePhone.replace(
      /\b(?:full\s+name|name|ako\s+si|pangalan\s+ko\s+ay|pangalan\s+ko|i\s+am|i'm|im|my\s+name\s+is|name\s+is)\b\s*[:\-]?/i,
      ""
    )
  );

  if (fallbackName && looksLikeFullName(fallbackName)) {
    return fallbackName;
  }

  return "";
}

export function parseLeadFields(value: string) {
  const fields = value
    .split(/\r?\n|,/)
    .map((field) => field.trim())
    .filter(Boolean);
  const uniqueFields = fields.length > 0 ? Array.from(new Set(fields)) : DEFAULT_LEAD_FIELDS;

  return [
    "Full Name",
    "Phone",
    ...uniqueFields.filter((field) => !["Full Name", "Phone"].includes(field)),
  ];
}

function normalizeFieldKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function extractEmailFromMessage(message: string) {
  return message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
}

function extractSimpleField(message: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(
      `\\b${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b\\s*[:\\-]?\\s*([^,\\n]{2,120})`,
      "i"
    );
    const match = message.match(pattern);
    const value = match?.[1]?.trim() ?? "";

    if (value) {
      return value.replace(PHONE_PATTERN, "").trim();
    }
  }

  return "";
}

function extractFieldValue(field: string, message: string, fullName: string, phone: string) {
  const key = normalizeFieldKey(field);

  if (key.includes("name")) {
    return fullName;
  }

  if (key.includes("phone") || key.includes("mobile") || key.includes("contact")) {
    return phone;
  }

  if (key.includes("email")) {
    return extractEmailFromMessage(message);
  }

  if (key.includes("address") || key.includes("location")) {
    return extractSimpleField(message, ["address", "location", "delivery address"]);
  }

  if (key.includes("budget")) {
    return extractSimpleField(message, ["budget", "price range"]);
  }

  if (key.includes("date") || key.includes("schedule")) {
    return extractSimpleField(message, ["date", "schedule", "preferred date"]);
  }

  if (key.includes("time")) {
    return extractSimpleField(message, ["time", "preferred time"]);
  }

  if (key.includes("message") || key.includes("inquiry") || key.includes("concern")) {
    return message.trim();
  }

  return extractSimpleField(message, [field]);
}

function getFieldAliases(field: string) {
  const key = normalizeFieldKey(field);
  const aliases = [field];

  if (key.includes("name")) {
    aliases.push("Name");
  }

  if (key.includes("phone") || key.includes("mobile") || key.includes("contact")) {
    aliases.push("Phone", "Phone Number", "Contact Number", "Mobile Number");
  }

  return Array.from(new Set(aliases));
}

function extractFormattedField(message: string, field: string) {
  for (const alias of getFieldAliases(field)) {
    const pattern = new RegExp(
      `^\\s*${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*(.+?)\\s*$`,
      "im"
    );
    const value = message.match(pattern)?.[1]?.trim() ?? "";

    if (value) {
      return value;
    }
  }

  return "";
}

type LeadPromptReason =
  | "order"
  | "booking"
  | "human_contact"
  | "quote"
  | "reservation"
  | "generic";

function detectLeadPromptLanguage(message = "") {
  const normalizedMessage = message.toLowerCase();
  const hasFilipinoCue =
    /\b(po|opo|sige|pwede|pede|ako|magpa|pa\s*(?:reserve|book|contact|call)|gusto|bumili|kailangan|salamat)\b/i.test(
      normalizedMessage
    );

  return hasFilipinoCue ? "taglish" : "english";
}

function getLeadPromptIntro(reason: LeadPromptReason, message = "") {
  const language = detectLeadPromptLanguage(message);

  if (language === "taglish") {
    switch (reason) {
      case "order":
        return "Got it po. To help prepare your order, please send your details below:";
      case "booking":
        return "Sige po, we can help arrange that. Please send your details below so our team can confirm the schedule:";
      case "human_contact":
        return "Sure po, I can ask our team to contact you. Please send your details below:";
      case "quote":
        return "Sige po, I can forward this for a proper quote. Please send your details below:";
      case "reservation":
        return "Sige po, I can help forward your reservation request. Please send your details below:";
      default:
        return "Sure po, I can forward this to our team. Please send your details below:";
    }
  }

  switch (reason) {
    case "order":
      return "Got it. To help prepare your order, please send your details below:";
    case "booking":
      return "Sure, we can help arrange that. Please send your details below so our team can confirm the schedule:";
    case "human_contact":
      return "Sure, I can ask our team to contact you. Please send your details below:";
    case "quote":
      return "Sure, I can forward this for a proper quote. Please send your details below:";
    case "reservation":
      return "Sure, I can help forward your reservation request. Please send your details below:";
    default:
      return "Sure, I can forward this to our team. Please send your details below:";
  }
}

export function createLeadInformationPrompt(
  leadFields: string[],
  options: { reason?: LeadPromptReason; customerMessage?: string } = {}
) {
  const lines = leadFields.map((field) => `${field}:`).join("\n");
  const intro = getLeadPromptIntro(options.reason ?? "generic", options.customerMessage);

  return `${intro}\n\n${lines}`;
}

export function extractFormattedLeadFromMessage(
  message: string,
  leadFields: string[] = DEFAULT_LEAD_FIELDS
): CapturedLead | null {
  const fields = Object.fromEntries(
    leadFields.map((field) => [field, extractFormattedField(message, field)])
  );
  const hasFormattedField = Object.values(fields).some(Boolean);

  if (!hasFormattedField) {
    return null;
  }

  const fullName = fields["Full Name"] || fields.Name || "";
  const phone = fields.Phone || fields["Phone Number"] || "";

  if (!fullName || !phone) {
    return null;
  }

  return {
    fullName,
    phone,
    fields,
  };
}

export function extractLeadFromMessage(message: string, leadFields: string[] = DEFAULT_LEAD_FIELDS): CapturedLead | null {
  const phoneMatch = message.match(PHONE_PATTERN);
  const phone = phoneMatch?.[0] ? normalizePhone(phoneMatch[0]) : "";
  const fullName = extractNameFromMessage(message);

  if (!phone || !fullName) {
    return null;
  }

  const fields = Object.fromEntries(
    leadFields.map((field) => [
      field,
      extractFieldValue(field, message, fullName, phone),
    ])
  );

  return {
    fullName,
    phone,
    fields,
  };
}
