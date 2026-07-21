import "server-only";

export type ConversationMemoryState = Record<string, unknown>;

export type RecentConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_SUMMARY_CHARS = 900;
const MAX_MESSAGE_CHARS = 320;
const MAX_RECENT_MESSAGES = 6;

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

export function inferCustomerState(
  previousState: ConversationMemoryState = {},
  customerMessage: string,
  leadCaptured = false
) {
  const nextState: ConversationMemoryState = { ...previousState };
  const intent = detectIntent(customerMessage);
  const budget = extractBudget(customerMessage);
  const interestedProduct = extractInterestedProduct(customerMessage);

  if (intent) {
    nextState.intent = intent;
  }

  if (budget) {
    nextState.budget = clip(budget, 80);
  }

  if (interestedProduct) {
    nextState.interested_product = clip(interestedProduct, 80);
  }

  if (leadCaptured) {
    nextState.lead_status = "captured";
  } else if (/\b(name|phone|contact|number|email)\b/i.test(customerMessage)) {
    nextState.lead_status = "partial_or_possible";
  }

  if (intent === "handoff") {
    nextState.handoff_status = "requested";
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

  if (/^(thanks|thank you|ty|salamat|salamat po|thank you po)[.!?]*$/.test(normalizedMessage)) {
    return "You're welcome po. Message us anytime if you need anything else.";
  }

  if (/^(ok|okay|sige|noted)[.!?]*$/.test(normalizedMessage)) {
    return "Sige po. I'll be here if you need more details.";
  }

  return "";
}
