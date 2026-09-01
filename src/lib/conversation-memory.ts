import "server-only";

import { detectCustomerLanguageStyle } from "@/lib/language-style";

export type ConversationMemoryState = Record<string, unknown>;

export type CustomerJourneyStage =
  | "new"
  | "quotation"
  | "production"
  | "fulfillment"
  | "completed";

export type RecentConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_SUMMARY_CHARS = 900;
const MAX_MESSAGE_CHARS = 320;
const MAX_RECENT_MESSAGES = 6;

const CUSTOMER_JOURNEY_STAGE_RANK: Record<CustomerJourneyStage, number> = {
  new: 0,
  quotation: 1,
  production: 2,
  fulfillment: 3,
  completed: 4,
};

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function clip(value: string, maxLength: number) {
  const cleanedValue = cleanText(value);

  if (cleanedValue.length <= maxLength) {
    return cleanedValue;
  }

  return `${cleanedValue.slice(0, maxLength - 3).trim()}...`;
}

function detectIntent(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (/\b(order|buy|purchase|reserve)\b/.test(normalizedMessage)) {
    return "order";
  }

  if (/\b(book|booking|schedule|appointment|meeting|viewing|visit)\b/.test(normalizedMessage)) {
    return "booking";
  }

  if (/\b(price|how much|rate|cost|fee|magkano)\b/.test(normalizedMessage)) {
    return "pricing";
  }

  if (/\b(delivery|ship|pickup|deliver)\b/.test(normalizedMessage)) {
    return "delivery";
  }

  if (/\b(agent|specialist|human|staff|call|contact)\b/.test(normalizedMessage)) {
    return "handoff";
  }

  return "";
}

function extractBudget(message: string) {
  return (
    message.match(/(?:budget|around|under|up to|maximum|max)\s*[:\-]?\s*(?:php|p|₱)?\s*[\d,.]+k?/i)?.[0] ??
    message.match(/(?:php|p|₱)\s*[\d,.]+k?/i)?.[0] ??
    ""
  );
}

function extractInterestedProduct(message: string) {
  return (
    message.match(/\b\d+\s*(?:br|bedroom)\b/i)?.[0] ??
    message.match(/\b(?:combo|burger|fries|condo|unit|house|lot|package|plan)\b/i)?.[0] ??
    ""
  );
}

function getStageFromValue(value: unknown): CustomerJourneyStage {
  return value === "quotation" ||
    value === "production" ||
    value === "fulfillment" ||
    value === "completed"
    ? value
    : "new";
}

function detectCustomerJourneyStage(message: string): CustomerJourneyStage | null {
  const normalizedMessage = cleanText(message).toLowerCase();

  if (
    /\b(?:delivered|received|completed|finished|fulfilled)\b/.test(normalizedMessage) ||
    /\b(?:na[- ]deliver|natanggap|tapos na|nahuman na)\b/.test(normalizedMessage)
  ) {
    return "completed";
  }

  if (
    /\b(?:shipped|out for delivery|ready for pickup|ready to pick up|for delivery)\b/.test(normalizedMessage) ||
    /\b(?:na[- ]ship|ipapadala na|for delivery na|ready na for pickup|andam na para pickup)\b/.test(normalizedMessage)
  ) {
    return "fulfillment";
  }

  if (
    /\b(?:already|now|currently|is|has|have|being|started|starting|start|ongoing)\s+(?:in\s+)?production\b/.test(normalizedMessage) ||
    /\b(?:production\s+(?:has\s+)?(?:started|starting|start|is ongoing|ongoing|na))\b/.test(normalizedMessage) ||
    /\b(?:being produced|under production|order\s+(?:is\s+)?(?:being\s+)?processed)\b/.test(normalizedMessage) ||
    /\b(?:nasa|na sa|ongoing ang|sinimulan na ang|nagsimula na ang|naa na sa|sugod na ang|gisugdan na ang|ongoing na ang)\s+(?:production|produksyon)\b/.test(normalizedMessage) ||
    /\b(?:ginaproseso na|ginaprocess na|nagsimula na ang paggawa)\b/.test(normalizedMessage)
  ) {
    return "production";
  }

  if (
    /\b(?:quotation|quote)\s+(?:has been |was |is |already )?(?:sent|received|approved|accepted|prepared)\b/.test(normalizedMessage) ||
    /\b(?:sent|received|approved|accepted)\s+(?:the\s+)?(?:quotation|quote)\b/.test(normalizedMessage) ||
    /\b(?:naipadala|natanggap|naaprubahan|na[- ]approve)\s+(?:na\s+)?(?:ang\s+)?(?:quotation|quote)\b/.test(normalizedMessage)
  ) {
    return "quotation";
  }

  return null;
}

export function getCustomerJourneyStage(
  customerState: ConversationMemoryState = {}
): CustomerJourneyStage {
  return getStageFromValue(customerState.customer_journey_stage);
}

export function isCustomerPastQuotationStage(
  customerState: ConversationMemoryState = {}
) {
  return CUSTOMER_JOURNEY_STAGE_RANK[getCustomerJourneyStage(customerState)] >
    CUSTOMER_JOURNEY_STAGE_RANK.quotation;
}

export function inferCustomerState(
  previousState: ConversationMemoryState = {},
  customerMessage: string,
  leadCaptured = false,
  messageSource: "customer" | "page" = "customer"
) {
  const nextState: ConversationMemoryState = { ...previousState };
  const intent = detectIntent(customerMessage);
  const budget = extractBudget(customerMessage);
  const interestedProduct = extractInterestedProduct(customerMessage);
  const previousJourneyStage = getCustomerJourneyStage(nextState);
  const detectedJourneyStage = detectCustomerJourneyStage(customerMessage);

  if (
    detectedJourneyStage &&
    CUSTOMER_JOURNEY_STAGE_RANK[detectedJourneyStage] >=
      CUSTOMER_JOURNEY_STAGE_RANK[previousJourneyStage]
  ) {
    nextState.customer_journey_stage = detectedJourneyStage;
  }

  if (messageSource === "page") {
    nextState.last_page_context = clip(customerMessage, 180);
  }

  if (intent) {
    nextState.intent = intent;
  }

  if (budget) {
    nextState.budget = clip(budget, 80);
  }

  if (interestedProduct) {
    nextState.interested_product = clip(interestedProduct, 80);
  }

  if (leadCaptured || nextState.lead_status === "captured") {
    nextState.lead_status = "captured";
  } else if (/\b(name|phone|contact|number|email)\b/i.test(customerMessage)) {
    nextState.lead_status = "partial_or_possible";
  }

  if (intent === "handoff") {
    nextState.handoff_status = "requested";
  }

  if (isCustomerPastQuotationStage(nextState)) {
    nextState.quotation_status = "completed";
  }

  return nextState;
}

export function appendRecentConversationMessages(
  recentMessages: Array<{ role?: string; content?: string }> = [],
  customerMessage: string,
  aiReply = ""
) {
  const messages = [
    ...recentMessages.flatMap((message) => {
      const role = message.role === "user" || message.role === "assistant" ? message.role : null;
      const content = typeof message.content === "string" ? clip(message.content, MAX_MESSAGE_CHARS) : "";

      return role && content ? [{ role, content }] : [];
    }),
    { role: "user" as const, content: clip(customerMessage, MAX_MESSAGE_CHARS) },
  ];

  if (aiReply) {
    messages.push({ role: "assistant" as const, content: clip(aiReply, MAX_MESSAGE_CHARS) });
  }

  return messages
    .filter((message) => message.content)
    .slice(-MAX_RECENT_MESSAGES);
}

export function updateConversationSummary(
  previousSummary: string,
  customerMessage: string,
  aiReply = ""
) {
  const turnSummary = aiReply
    ? `Customer: ${clip(customerMessage, 180)} | Assistant: ${clip(aiReply, 180)}`
    : `Customer: ${clip(customerMessage, 180)}`;
  const nextSummary = previousSummary
    ? `${clip(previousSummary, MAX_SUMMARY_CHARS)} ${turnSummary}`
    : turnSummary;

  if (nextSummary.length <= MAX_SUMMARY_CHARS) {
    return nextSummary;
  }

  return clip(nextSummary.slice(nextSummary.length - MAX_SUMMARY_CHARS), MAX_SUMMARY_CHARS);
}

export function getDeterministicReply(message: string) {
  const normalizedMessage = message.trim().toLowerCase();
  const languageStyle = detectCustomerLanguageStyle(message);

  if (/^(thanks|thank you|ty|salamat|salamat po|thank you po)[.!?]*$/.test(normalizedMessage)) {
    if (languageStyle === "cebuano") {
      return "Walay sapayan. Message lang kung naa pa kay pangutana.";
    }

    if (languageStyle === "tagalog") {
      return "Walang anuman. Message ka lang kung may iba ka pang tanong.";
    }

    return "You're welcome po. Message us anytime if you need anything else.";
  }

  if (/^(ok|okay|sige|noted)[.!?]*$/.test(normalizedMessage)) {
    if (languageStyle === "cebuano") {
      return "Sige. Naa ra ko diri kung naa pa kay pangutana.";
    }

    if (languageStyle === "tagalog") {
      return "Sige. Nandito lang ako kung may iba ka pang tanong.";
    }

    return "Sige po. I'll be here if you need more details.";
  }

  return "";
}
