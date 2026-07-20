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
    .replace(/\b(?:phone|number|contact|mobile|cell|cp|tel)\b.*$/i, "")
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
