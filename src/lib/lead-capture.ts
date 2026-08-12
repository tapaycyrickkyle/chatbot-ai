import "server-only";

export const LEAD_FIELD_TYPES = ["name", "phone", "email", "text", "number", "date", "address"] as const;
export type LeadFieldType = (typeof LEAD_FIELD_TYPES)[number];
export type LeadField = { label: string; type: LeadFieldType };

const MAX_FIELDS = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const PHONE_CANDIDATE_PATTERN = /(?:\+?\d[\d\s().-]{7,}\d)/g;

export function parseLeadFields(value: string): LeadField[] {
  const seen = new Set<string>();
  return value.split(/\r?\n/).flatMap((line) => {
    const [rawLabel, rawType] = line.split("|");
    const label = rawLabel?.replace(/\s+/g, " ").trim().slice(0, 60) ?? "";
    const type = rawType?.trim().toLowerCase() as LeadFieldType;
    const key = label.toLowerCase();
    if (!label || !LEAD_FIELD_TYPES.includes(type) || seen.has(key) || seen.size >= MAX_FIELDS) return [];
    seen.add(key);
    return [{ label, type }];
  });
}

export function serializeLeadFields(fields: LeadField[]) {
  return fields.map((field) => `${field.label.trim()}|${field.type}`).join("\n");
}

export function normalizeLeadValue(type: LeadFieldType, value: string) {
  const trimmed = value.replace(/\s+/g, " ").trim().replace(/^[\s:=-]+|[\s,.;]+$/g, "");
  if (!trimmed) return "";
  if (type === "email") return EMAIL_PATTERN.test(trimmed) ? trimmed.toLowerCase() : "";
  if (type === "phone") {
    const compact = trimmed.replace(/[^\d+]/g, "");
    const digits = compact.replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 15 ? compact : "";
  }
  if (type === "number") return /^[-+]?\d+(?:[,.]\d+)?$/.test(trimmed) ? trimmed : "";
  if (type === "name") return /[\p{L}]/u.test(trimmed) && trimmed.length >= 2 && trimmed.length <= 100 ? trimmed : "";
  return trimmed.slice(0, 300);
}

function labelPattern(label: string) {
  return label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
}

export function extractLeadValues(message: string, fields: LeadField[], previous: Record<string, string> = {}) {
  const values = { ...previous };
  const labeled = fields.flatMap((field) => {
    const match = message.match(new RegExp(`(?:^|[\\n,;])\\s*(?:${labelPattern(field.label)})\\s*[:=-]\\s*([^\\n,;]+)`, "i"));
    const value = match ? normalizeLeadValue(field.type, match[1]) : "";
    return value ? [[field.label, value] as const] : [];
  });
  Object.assign(values, Object.fromEntries(labeled));

  for (const field of fields) {
    if (values[field.label]) continue;
    if (field.type === "email") {
      const email = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
      const value = normalizeLeadValue(field.type, email);
      if (value) values[field.label] = value;
    }
    if (field.type === "phone") {
      const candidate = message.match(PHONE_CANDIDATE_PATTERN)?.[0] ?? "";
      const value = normalizeLeadValue(field.type, candidate);
      if (value) values[field.label] = value;
    }
  }

  const missing = fields.filter((field) => !values[field.label]);
  if (missing.length === 1 && ["name", "text", "address", "date", "number"].includes(missing[0].type)) {
    const looksLikeAnswer = message.trim().length <= 180 && !/[?]/.test(message);
    const value = looksLikeAnswer ? normalizeLeadValue(missing[0].type, message) : "";
    if (value) values[missing[0].label] = value;
  }
  return values;
}

export function getMissingLeadField(fields: LeadField[], values: Record<string, string>) {
  return fields.find((field) => !values[field.label]);
}

export function getLeadFormPrompt(fields: LeadField[], languageStyle: string) {
  const heading = languageStyle === "cebuano"
    ? "Palihug ihatag ang mosunod nga detalye:"
    : languageStyle === "tagalog" || languageStyle === "taglish"
      ? "Pakibigay ang mga sumusunod na detalye:"
      : "We need the following details:";

  return `${heading}\n${fields.map((field) => `${field.label.toUpperCase()}:`).join("\n")}`;
}

export function getLeadPrompt(field: LeadField, languageStyle: string) {
  if (languageStyle === "cebuano") return `Unsa imong ${field.label}?`;
  if (languageStyle === "tagalog" || languageStyle === "taglish") return `Ano ang ${field.label} mo?`;
  return `What is your ${field.label}?`;
}

export function getLeadDeliveredReply(languageStyle: string) {
  if (languageStyle === "cebuano") return "Salamat, na-send na sa team imong detalye.";
  if (languageStyle === "tagalog" || languageStyle === "taglish") return "Salamat, naipadala na sa team ang details mo.";
  return "Thanks, your details have been sent to the team.";
}
