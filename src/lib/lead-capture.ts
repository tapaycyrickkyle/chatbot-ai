import "server-only";

export const LEAD_FIELD_TYPES = ["name", "phone", "email", "text", "number", "date", "address"] as const;
export type LeadFieldType = (typeof LEAD_FIELD_TYPES)[number];
export type LeadField = { label: string; type: LeadFieldType; required: boolean };

const MAX_FIELDS = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const PHONE_CANDIDATE_PATTERN = /(?:\+?\d[\d\s().-]{7,}\d)/g;

export function parseLeadFields(value: string): LeadField[] {
  const seen = new Set<string>();
  return value.split(/\r?\n/).flatMap((line) => {
    const [rawLabel, rawType, rawRequirement] = line.split("|");
    const label = rawLabel?.replace(/\s+/g, " ").trim().slice(0, 60) ?? "";
    const type = rawType?.trim().toLowerCase() as LeadFieldType;
    const key = label.toLowerCase();
    if (!label || !LEAD_FIELD_TYPES.includes(type) || seen.has(key) || seen.size >= MAX_FIELDS) return [];
    seen.add(key);
    return [{ label, type, required: rawRequirement?.trim().toLowerCase() !== "optional" }];
  });
}

export function serializeLeadFields(fields: LeadField[]) {
  return fields
    .map((field) => `${field.label.trim()}|${field.type}${field.required ? "" : "|optional"}`)
    .join("\n");
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

function formFieldLabelPattern(field: LeadField) {
  const optionalSuffix = field.required ? "" : "\\s*\\(\\s*optional\\s*\\)?";
  return `${labelPattern(field.label)}${optionalSuffix}`;
}

export function extractLeadValues(
  message: string,
  fields: LeadField[],
  previous: Record<string, string> = {},
  expectedField?: LeadField
) {
  const values = { ...previous };
  const labeled = fields.flatMap((field) => {
    const match = message.match(new RegExp(`(?:^|[\\n,;])\\s*(?:${formFieldLabelPattern(field)})\\s*[:=-]\\s*([^\\n,;]+)`, "i"));
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

  let extractedNewValue = fields.some(
    (field) => !previous[field.label] && Boolean(values[field.label])
  );
  const messageLines = message.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  // Customers often reply by pasting one value per line instead of preserving
  // the field labels. Once email and phone values have been recognized above,
  // keep those lines out of the plain-text pass and map the remaining lines to
  // the remaining name/text fields in the same order as the form. This lets an
  // optional field be captured when it was supplied, without treating it as
  // required when the customer leaves it out.
  if (messageLines.length > 1) {
    const fieldLabelLine = new RegExp(
      `^(?:${fields.map(formFieldLabelPattern).join("|")})\\s*[:=-]`,
      "i"
    );
    const plainLines = messageLines.filter((line) => {
      if (fieldLabelLine.test(line) || /[?]/.test(line)) return false;

      return ![
        normalizeLeadValue("email", line),
        normalizeLeadValue("phone", line),
        normalizeLeadValue("number", line),
      ].some(Boolean);
    });
    const plainFields = fields.filter(
      (field) =>
        !values[field.label] &&
        ["name", "text", "address", "date"].includes(field.type)
    );

    for (const [index, line] of plainLines.entries()) {
      const field = plainFields[index];
      if (!field) break;

      const value = normalizeLeadValue(field.type, line);
      if (value) {
        values[field.label] = value;
        extractedNewValue = true;
      }
    }
  }

  const expectedAnswer = messageLines[0] ?? message;
  if (expectedField && !values[expectedField.label] && (!extractedNewValue || messageLines.length > 1)) {
    const looksLikeAnswer = expectedAnswer.length <= 180 && !/[?]/.test(expectedAnswer);
    const value = looksLikeAnswer ? normalizeLeadValue(expectedField.type, expectedAnswer) : "";
    if (value) {
      values[expectedField.label] = value;
      extractedNewValue = true;
    }
  }

  const missing = fields.filter((field) => !values[field.label]);
  // A message may already have supplied another field (for example, a phone
  // number). Do not reuse that same message as the final free-text field.
  if (!extractedNewValue && missing.length === 1 && ["name", "text", "address", "date", "number"].includes(missing[0].type)) {
    const looksLikeAnswer = message.trim().length <= 180 && !/[?]/.test(message);
    const value = looksLikeAnswer ? normalizeLeadValue(missing[0].type, message) : "";
    if (value) values[missing[0].label] = value;
  }
  return values;
}

export function getMissingLeadField(fields: LeadField[], values: Record<string, string>) {
  return fields.find((field) => field.required && !values[field.label]);
}

export function getLeadFormPrompt(fields: LeadField[], languageStyle: string) {
  const heading = languageStyle === "cebuano"
    ? "Aron mapaspas ang paghimo sa quotation, palihug kopyaha ang format sa ubos ug tubaga ang mga required nga field. Pwede ra nimo biyaan og blanko ang optional nga field."
    : languageStyle === "tagalog" || languageStyle === "taglish"
      ? "Para mapabilis ang paggawa ng quotation, pakikopya ang format sa ibaba at sagutan ang required na fields. Puwedeng iwanang blanko ang optional na field."
      : "To help us prepare your quotation faster, please copy the format below and complete the required fields. Optional fields may be left blank.";

  return `${heading}\n\n${fields.map((field) => `${field.label}${field.required ? "" : " (Optional)"}:`).join("\n")}`;
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
