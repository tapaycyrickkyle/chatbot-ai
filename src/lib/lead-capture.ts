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
};

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

export function extractLeadFromMessage(message: string): CapturedLead | null {
  const phoneMatch = message.match(PHONE_PATTERN);
  const phone = phoneMatch?.[0] ? normalizePhone(phoneMatch[0]) : "";
  const fullName = extractNameFromMessage(message);

  if (!phone || !fullName) {
    return null;
  }

  return {
    fullName,
    phone,
  };
}
