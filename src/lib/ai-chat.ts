import "server-only";

import {
  detectCustomerLanguageStyle,
  getMissingInfoReply,
  type CustomerLanguageStyle,
} from "@/lib/language-style";
import { MAX_BUSINESS_INFO_LENGTH } from "@/lib/business-info";

const AI_TEMPORARY_UNAVAILABLE_MESSAGE =
  "Thanks for your message. Our team will check this and get back to you shortly.";

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
      cache_write_tokens?: number;
      prompt_cache_hit_tokens?: number;
      prompt_cache_miss_tokens?: number;
    };
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
  };
};

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type SalesPlan = {
  languageName: string;
  replyInstruction: string;
  leadCaptureIntent: LeadCaptureIntent;
  resolvedCustomerMeaning: string;
  conversationAction: string;
  buyerIntent: string;
  buyerStage: string;
  likelyConcern: string;
  bestAnswerAngle: string;
  bestNextStep: string;
  shouldAskFollowUp: boolean;
};

export type LeadCaptureIntent =
  | "INFO_ONLY"
  | "SOFT_INTEREST"
  | "READY_TO_BUY_OR_BOOK"
  | "WANTS_HUMAN_CONTACT"
  | "PROVIDED_LEAD_DETAILS"
  | "UNCLEAR";

type ConversationContext = {
  previousCustomerMessage?: string;
  previousAiReply?: string;
  conversationSummary?: string;
  customerState?: Record<string, unknown>;
  recentMessages?: Array<{
    role?: string;
    content: string;
  }>;
  aiCharacter?: string;
  aiTone?: string;
  latestLeadIntent?: LeadCaptureIntent;
  replyPlan?: SalesPlan;
};

const DEFAULT_MAX_OUTPUT_TOKENS = 160;
const MAX_RECENT_MESSAGES_FOR_PROMPT = 6;
const MAX_RECENT_MESSAGE_CHARS = 320;
const MAX_MEMORY_CHARS = 900;
const DEFAULT_MAX_BUSINESS_CONTEXT_CHARS = MAX_BUSINESS_INFO_LENGTH;
const DEFAULT_REPLY_SENTENCE_LIMIT = 2;
const LEAD_INTENTS = new Set<LeadCaptureIntent>([
  "INFO_ONLY",
  "SOFT_INTEREST",
  "READY_TO_BUY_OR_BOOK",
  "WANTS_HUMAN_CONTACT",
  "PROVIDED_LEAD_DETAILS",
  "UNCLEAR",
]);
const ARGUMENTATIVE_TONE_PATTERN =
  /\b(?:talagang gusto mo|obviously|clearly you|you keep asking|paulit-ulit|pinipilit)\b/i;
const ENGLISH_REPLY_NON_ENGLISH_PATTERN =
  /\b(?:po|opo|natin|namin|kami|kayo|ikaw|ako|mo|talaga|talagang|gusto|nasa|mayroon|meron|wala|lokasyon|unsa|pila|naa|ug|diri|imong|imoha|among)\b/i;
const CEBUANO_REPLY_TAGALOG_PATTERN =
  /\b(?:talagang|mayroon|meron|nakatayo|kami|natin|iyong|lokasyon|mas maraming|sa loob mismo|tungkol diyan)\b/i;
const TAGALOG_REPLY_CEBUANO_PATTERN =
  /\b(?:unsa|pila|naa|ug|diri|adto|ari|palihug|imong|imoha|among|koy|tabangan)\b/i;
const MISSING_INFO_REPLY_PATTERN =
  /\b(?:i|we|our team|the team)\s+(?:do not|don't|does not|doesn't|did not|didn't|cannot|can't)\s+(?:have|know)\b|\b(?:no exact info|no exact details|not listed|not provided|not in the business facts)\b/i;

function isLeadCollectionText(value = "") {
  const normalizedValue = value.toLowerCase();

  return (
    (normalizedValue.includes("full name:") &&
      (normalizedValue.includes("phone:") || normalizedValue.includes("contact number:"))) ||
    /\b(?:send|provide)\s+(?:your\s+)?details\b/i.test(normalizedValue) ||
    /\bwould you like to proceed\b/i.test(normalizedValue) ||
    /\bto proceed\b/i.test(normalizedValue)
  );
}

function shouldSuppressLeadContext(intent?: LeadCaptureIntent) {
  return intent === "INFO_ONLY" || intent === "SOFT_INTEREST" || intent === "UNCLEAR";
}

function createFallbackSalesPlan(
  languageStyle: CustomerLanguageStyle,
  latestLeadIntent?: LeadCaptureIntent
): SalesPlan {
  const shouldAskFollowUp =
    latestLeadIntent !== "PROVIDED_LEAD_DETAILS" && latestLeadIntent !== "WANTS_HUMAN_CONTACT";

  return {
    ...parseSalesPlan("", languageStyle),
    leadCaptureIntent: latestLeadIntent ?? "UNCLEAR",
    resolvedCustomerMeaning:
      "Answer the latest customer message directly using the business facts and recent conversation only when needed.",
    conversationAction: "answer_latest_message",
    buyerIntent: "understand_latest_message",
    buyerStage: "unknown",
    likelyConcern: "none",
    bestAnswerAngle: "answer_directly_using_business_facts",
    bestNextStep:
      latestLeadIntent === "READY_TO_BUY_OR_BOOK"
        ? "collect one useful next detail and say the team will confirm"
        : "ask one relevant qualifying question after the answer",
    shouldAskFollowUp,
  };
}

function getMemorySummaryForPrompt(context: ConversationContext) {
  const memorySummary = context.conversationSummary?.trim() ?? "";

  if (
    !memorySummary ||
    (shouldSuppressLeadContext(context.latestLeadIntent) && isLeadCollectionText(memorySummary))
  ) {
    return "";
  }

  return memorySummary.slice(0, MAX_MEMORY_CHARS);
}

function getPreviousAiReplyForPrompt(context: ConversationContext) {
  const previousAiReply = context.previousAiReply?.trim() ?? "";

  if (
    !previousAiReply ||
    (shouldSuppressLeadContext(context.latestLeadIntent) && isLeadCollectionText(previousAiReply))
  ) {
    return "";
  }

  return previousAiReply;
}

function getRecentMessagesForPrompt(context: ConversationContext) {
  const recentMessages = context.recentMessages?.slice(-MAX_RECENT_MESSAGES_FOR_PROMPT) ?? [];

  if (!shouldSuppressLeadContext(context.latestLeadIntent)) {
    return recentMessages;
  }

  return recentMessages.filter((message) => !isLeadCollectionText(message.content));
}

function getReplyLanguageInstruction(languageStyle: ReturnType<typeof detectCustomerLanguageStyle>) {
  switch (languageStyle) {
    case "english":
      return "Write the next assistant reply in English only. Do not use Bisaya/Cebuano, Tagalog, or Taglish, even if previous messages used them.";
    case "cebuano":
      return "Write the next assistant reply in natural everyday Bisaya/Cebuano, like a friendly local sales agent. Use Bisaya words first. Do not use Tagalog. Use English only for product names, prices, brand names, or words that sound awkward in Bisaya.";
    case "tagalog":
      return "Write the next assistant reply in Tagalog only. Do not use Bisaya/Cebuano or English except for unavoidable product names.";
    case "taglish":
      return "Write the next assistant reply in natural Taglish, matching the latest customer message. Do not use Bisaya/Cebuano.";
    default:
      return "If the latest customer message is short, ambiguous, or mostly English/Latin text, write the next assistant reply in English only unless the message contains clear Tagalog or Bisaya/Cebuano words.";
  }
}

function hasWrongReplyLanguage(reply: string, languageStyle: CustomerLanguageStyle) {
  switch (languageStyle) {
    case "english":
      return ENGLISH_REPLY_NON_ENGLISH_PATTERN.test(reply);
    case "cebuano":
      return CEBUANO_REPLY_TAGALOG_PATTERN.test(reply);
    case "tagalog":
      return TAGALOG_REPLY_CEBUANO_PATTERN.test(reply);
    case "taglish":
      return TAGALOG_REPLY_CEBUANO_PATTERN.test(reply);
    default:
      return ENGLISH_REPLY_NON_ENGLISH_PATTERN.test(reply);
  }
}

function needsReplyRewrite(reply: string, languageStyle: CustomerLanguageStyle) {
  return ARGUMENTATIVE_TONE_PATTERN.test(reply) || hasWrongReplyLanguage(reply, languageStyle);
}

function cleanJsonText(value: string) {
  return value.replace(/```(?:json)?|```/gi, "").trim();
}

function parseSalesPlan(value: string, fallbackStyle: CustomerLanguageStyle): SalesPlan {
  try {
    const parsed = JSON.parse(cleanJsonText(value)) as Partial<Record<keyof SalesPlan, unknown>>;

    return {
      languageName:
        typeof parsed.languageName === "string" && parsed.languageName.trim()
          ? parsed.languageName.trim().slice(0, 80)
          : fallbackStyle,
      replyInstruction:
        typeof parsed.replyInstruction === "string" && parsed.replyInstruction.trim()
          ? parsed.replyInstruction.trim().slice(0, 220)
          : getReplyLanguageInstruction(fallbackStyle),
      leadCaptureIntent:
        typeof parsed.leadCaptureIntent === "string"
          ? parseLeadIntent(parsed.leadCaptureIntent)
          : "UNCLEAR",
      resolvedCustomerMeaning:
        typeof parsed.resolvedCustomerMeaning === "string"
          ? parsed.resolvedCustomerMeaning.slice(0, 240)
          : "Interpret the latest message using the recent conversation.",
      conversationAction:
        typeof parsed.conversationAction === "string"
          ? parsed.conversationAction.slice(0, 120)
          : "answer_latest_message",
      buyerIntent: typeof parsed.buyerIntent === "string" ? parsed.buyerIntent.slice(0, 120) : "understand_latest_message",
      buyerStage: typeof parsed.buyerStage === "string" ? parsed.buyerStage.slice(0, 80) : "unknown",
      likelyConcern: typeof parsed.likelyConcern === "string" ? parsed.likelyConcern.slice(0, 160) : "none",
      bestAnswerAngle: typeof parsed.bestAnswerAngle === "string" ? parsed.bestAnswerAngle.slice(0, 220) : "answer_directly_using_business_facts",
      bestNextStep: typeof parsed.bestNextStep === "string" ? parsed.bestNextStep.slice(0, 180) : "answer_only",
      shouldAskFollowUp: parsed.shouldAskFollowUp === true,
    };
  } catch {
    return {
      languageName: fallbackStyle,
      replyInstruction: getReplyLanguageInstruction(fallbackStyle),
      leadCaptureIntent: "UNCLEAR",
      resolvedCustomerMeaning: "Interpret the latest message using the recent conversation.",
      conversationAction: "answer_latest_message",
      buyerIntent: "understand_latest_message",
      buyerStage: "unknown",
      likelyConcern: "none",
      bestAnswerAngle: "answer_directly_using_business_facts",
      bestNextStep: "answer_only",
      shouldAskFollowUp: false,
    };
  }
}

function normalizeForFactCheck(value = "") {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function mentionsUnsupportedContactChannel(reply: string, businessContext: string) {
  const normalizedReply = normalizeForFactCheck(reply);
  const normalizedBusinessContext = normalizeForFactCheck(businessContext);
  const channels = [
    "viber",
    "whatsapp",
    "telegram",
    "email",
    "gmail",
    "phone",
    "call",
    "sms",
    "text",
  ];

  return channels.some(
    (channel) =>
      normalizedReply.includes(channel) && !normalizedBusinessContext.includes(channel)
  );
}

function isMissingInfoReply(reply: string, requiredFallback: string) {
  const normalizedReply = normalizeForFactCheck(reply);

  if (!normalizedReply || normalizedReply === normalizeForFactCheck(requiredFallback)) {
    return false;
  }

  return MISSING_INFO_REPLY_PATTERN.test(normalizedReply);
}

function getErrorSummary(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

function getAiConfig() {
  const apiKey = process.env.AI_API_KEY?.trim() || "";
  const apiUrl = process.env.AI_API_URL?.trim() || "";
  const model = process.env.AI_MODEL?.trim() || "";

  return {
    apiKey,
    apiUrl,
    model,
  };
}

function getMaxOutputTokens() {
  const configuredValue = Number(process.env.AI_MAX_OUTPUT_TOKENS);

  if (Number.isFinite(configuredValue) && configuredValue >= 60 && configuredValue <= 300) {
    return Math.floor(configuredValue);
  }

  return DEFAULT_MAX_OUTPUT_TOKENS;
}

function getMaxBusinessContextChars() {
  const configuredValue = Number(process.env.AI_MAX_BUSINESS_CONTEXT_CHARS);

  if (Number.isFinite(configuredValue) && configuredValue >= 1000) {
    return Math.min(Math.floor(configuredValue), MAX_BUSINESS_INFO_LENGTH);
  }

  return DEFAULT_MAX_BUSINESS_CONTEXT_CHARS;
}

function getReplySentenceLimit() {
  const configuredValue = Number(process.env.AI_REPLY_SENTENCE_LIMIT);

  if (Number.isFinite(configuredValue) && configuredValue >= 1 && configuredValue <= 3) {
    return Math.floor(configuredValue);
  }

  return DEFAULT_REPLY_SENTENCE_LIMIT;
}

function getBusinessContextForPrompt(value: string) {
  const cleanedValue = value.replace(/\s+/g, " ").trim();
  const maxLength = getMaxBusinessContextChars();

  if (cleanedValue.length <= maxLength) {
    return cleanedValue;
  }

  console.warn("AI business context clipped for token control", {
    originalChars: cleanedValue.length,
    maxChars: maxLength,
  });

  return `${cleanedValue.slice(0, maxLength - 3).trim()}...`;
}

function createAiHeaders(apiKey: string, apiUrl: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (apiUrl.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = process.env.AI_SITE_URL || "http://localhost:3000";
    headers["X-Title"] = process.env.AI_APP_NAME || "AI Inbox";
  }

  return headers;
}

function createAiRequestBody(input: {
  apiUrl: string;
  model: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
}) {
  const body: Record<string, unknown> = {
    model: input.model,
    temperature: input.temperature,
    max_tokens: input.maxTokens,
    messages: input.messages,
  };

  if (input.apiUrl.includes("api.deepseek.com")) {
    body.thinking = { type: "disabled" };
  }

  return body;
}

async function requestChatCompletion(input: {
  apiKey: string;
  apiUrl: string;
  model: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  purpose: "planner" | "reply";
}) {
  const response = await fetch(input.apiUrl, {
    method: "POST",
    headers: createAiHeaders(input.apiKey, input.apiUrl),
    body: JSON.stringify(createAiRequestBody(input)),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");

    console.error("AI request failed", {
      providerUrl: input.apiUrl,
      model: input.model,
      status: response.status,
      statusText: response.statusText,
      body: errorText,
    });

    return AI_TEMPORARY_UNAVAILABLE_MESSAGE;
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const usage = data.usage;

  if (usage) {
    console.info("AI token usage", {
      purpose: input.purpose,
      model: input.model,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      cachedTokens: usage.prompt_tokens_details?.cached_tokens,
      cacheWriteTokens: usage.prompt_tokens_details?.cache_write_tokens,
      promptCacheHitTokens:
        usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.prompt_cache_hit_tokens,
      promptCacheMissTokens:
        usage.prompt_cache_miss_tokens ?? usage.prompt_tokens_details?.prompt_cache_miss_tokens,
    });
  }

  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function planRealEstateSalesReply(input: {
  apiKey: string;
  apiUrl: string;
  model: string;
  userMessage: string;
  businessContext: string;
  conversationSummary: string;
  recentMessages: Array<{ role?: string; content: string }>;
  latestLeadIntent?: LeadCaptureIntent;
  fallbackStyle: CustomerLanguageStyle;
}) {
  const recentMessages = input.recentMessages
    .slice(-4)
    .map((message) => `${message.role === "assistant" ? "Assistant" : "Customer"}: ${message.content}`)
    .join("\n")
    .slice(0, 1000);

  const response = await requestChatCompletion({
    apiKey: input.apiKey,
    apiUrl: input.apiUrl,
    model: input.model,
    temperature: 0.1,
    maxTokens: 260,
    purpose: "planner",
    messages: [
      {
        role: "system",
        content:
          "You are the private sales strategist for a Messenger sales and customer-support assistant. Think carefully, but return only compact JSON. Do not write the customer-facing reply.",
      },
      {
        role: "user",
        content: `Understand the latest customer turn in context, then plan the best sales response for the business described in the business facts.

Rules:
- Use only the business facts. Do not invent prices, availability, promos, terms, requirements, policies, services, products, branches, delivery areas, or schedules.
- Infer the business type from the business facts, then adapt the sales approach to that business.
- First resolve what the customer really means using recent conversation and the previous assistant reply.
- Understand confirmations, refusals, choices, fragments, follow-ups, and corrections in any language. Do not require fixed keywords or triggers from the customer.
- Short replies such as "yes", "opo", "oo", "sige", "sure", "go", "tell me", "okay", "hm", "why", "how", "that one", "1BR", or any local-language equivalent must be interpreted from context, not treated as a new standalone topic.
- If the previous assistant offered to explain something and the customer confirms in any language, the action is continue_previous_offer and the answer should provide the explanation promised.
- If the previous assistant asked a choice question and the customer answers with one option, continue with that option.
- If the customer refuses or hesitates in any language, answer gently and offer a lower-pressure next step.
- If the customer asks a new question, answer the new question directly.
- If the customer asks a broad info request such as "details", "info", "more info", "tell me more", "explain", "interested", "unsa ni", "ano ito", or any equivalent, plan a short overview from the available business facts instead of treating it as missing information.
- If the business facts include a script or FAQ matching the customer's intent, use that script's facts naturally without copying labels like "Details:".
- Identify what the customer is really trying to decide.
- Choose the answer angle most likely to build trust and move the customer closer to a qualified inquiry, purchase, order, appointment request, quote request, visit, consultation, or human handoff.
- Choose a simple answer angle that a regular customer can understand quickly. Avoid technical or formal explanations unless the customer clearly asks for them.
- Identify one relevant benefit from the business facts that matches the customer's likely need, such as savings, convenience, quality, location, flexibility, speed, comfort, safety, trust, suitability, or easier decision-making.
- Use benefits as proof-based persuasion, not hype. Never claim guarantees, scarcity, urgency, returns, approval, outcomes, or superiority unless explicitly stated in the business facts.
- Prefer one simple useful qualifying question after the answer when it helps identify fit: product/service/package needed, budget range, preferred date or timing, location, quantity, purpose/use case, payment preference, delivery/pickup need, size/color/model, concern, or main goal.
- Do not recommend asking for name/phone/contact details unless the customer is ready to proceed, asks for a human/team follow-up, or has already offered contact details.
- Booking, reservation, appointment, order confirmation, availability confirmation, final pricing, custom quotes, approvals, and discounts still require the team/human to confirm unless the business facts explicitly say the AI can confirm them.
- Classify the latest customer message for intent only. This classification helps choose the answer style and must not trigger a lead form.
- Intent labels:
  INFO_ONLY = asks for info, details, price, availability, requirements, photos, location, computation/quote, options, services, products, delivery, or how the process/order works.
  SOFT_INTEREST = interested but not asking to be contacted, scheduled, reserved, quoted, or processed yet.
  READY_TO_BUY_OR_BOOK = clearly wants to buy, reserve, book, schedule, visit, set an appointment, or proceed now.
  WANTS_HUMAN_CONTACT = asks for a person/team/agent/specialist to call, contact, message, or assist them directly.
  PROVIDED_LEAD_DETAILS = provides name and phone/contact details.
  UNCLEAR = not enough context.
- "how to order" is INFO_ONLY unless they also say they want to order now.
- Detect the customer's latest language or language mix from the latest customer message only. If it contains clear Bisaya/Cebuano words or sentence patterns, classify it as Bisaya/Cebuano even if it also has English words or polite words like "po". If short English like "yes", "ok", "now i understand", "got it", or "sure", classify as English.
- The replyInstruction must tell the final assistant exactly what language or mix to use.
- Keep the next step soft and natural. The best next step should make the chat feel helpful, not like a form.

Return only JSON:
{
  "languageName":"English/Tagalog/Taglish/Cebuano-English/etc",
  "replyInstruction":"Reply in English only.",
  "leadCaptureIntent":"INFO_ONLY/SOFT_INTEREST/READY_TO_BUY_OR_BOOK/WANTS_HUMAN_CONTACT/PROVIDED_LEAD_DETAILS/UNCLEAR",
  "resolvedCustomerMeaning":"what the latest customer message means in context",
  "conversationAction":"continue_previous_offer/answer_new_question/answer_choice/clarify/soft_sell/ask_next_step",
  "buyerIntent":"price/location/availability/payment/options/comparison/etc",
  "buyerStage":"browsing/interested/qualified/ready_for_next_step/ready_for_handoff",
  "likelyConcern":"short description",
  "bestAnswerAngle":"what the final reply should emphasize",
  "bestNextStep":"one soft next step or answer_only",
  "shouldAskFollowUp":false
}

Previous lead intent:
${input.latestLeadIntent || "UNCLEAR"}

Recent conversation:
${recentMessages || input.conversationSummary || "None"}

Business facts:
${getBusinessContextForPrompt(input.businessContext) || "No business facts provided."}

Latest customer message:
${input.userMessage}`,
      },
    ],
  });

  if (!response || response === AI_TEMPORARY_UNAVAILABLE_MESSAGE) {
    return parseSalesPlan("", input.fallbackStyle);
  }

  return parseSalesPlan(response, input.fallbackStyle);
}

function parseLeadIntent(value: string): LeadCaptureIntent {
  const normalizedValue = value
    .replace(/```(?:json)?|```/gi, "")
    .trim()
    .toUpperCase();

  try {
    const parsed = JSON.parse(normalizedValue) as { intent?: unknown };
    const intent = typeof parsed.intent === "string" ? parsed.intent.toUpperCase() : "";

    if (LEAD_INTENTS.has(intent as LeadCaptureIntent)) {
      return intent as LeadCaptureIntent;
    }
  } catch {
    // Some providers return the label as plain text.
  }

  const label = normalizedValue.match(
    /\b(INFO_ONLY|SOFT_INTEREST|READY_TO_BUY_OR_BOOK|WANTS_HUMAN_CONTACT|PROVIDED_LEAD_DETAILS|UNCLEAR)\b/
  )?.[1];

  return LEAD_INTENTS.has(label as LeadCaptureIntent) ? (label as LeadCaptureIntent) : "UNCLEAR";
}

export async function planAiReply(
  userMessage: string,
  businessContext: string,
  conversationContext: ConversationContext = {}
): Promise<SalesPlan> {
  const latestLanguageStyle = detectCustomerLanguageStyle(userMessage);
  const { apiKey, apiUrl, model } = getAiConfig();

  if (!apiUrl || !apiKey || !model) {
    console.error("AI planning failed: missing AI_API_URL, AI_API_KEY, or AI_MODEL");
    return parseSalesPlan("", latestLanguageStyle);
  }

  try {
    return await planRealEstateSalesReply({
      apiKey,
      apiUrl,
      model,
      userMessage,
      businessContext,
      conversationSummary: getMemorySummaryForPrompt(conversationContext),
      recentMessages: getRecentMessagesForPrompt(conversationContext),
      latestLeadIntent: conversationContext.latestLeadIntent,
      fallbackStyle: latestLanguageStyle,
    });
  } catch (error) {
    console.warn("AI planning failed", getErrorSummary(error));
    return parseSalesPlan("", latestLanguageStyle);
  }
}

export async function askAi(
  userMessage: string,
  businessContext: string,
  conversationContext: ConversationContext = {}
) {
  const memorySummary = getMemorySummaryForPrompt(conversationContext);
  const customerState = conversationContext.customerState ?? {};
  const customerStateText =
    Object.keys(customerState).length > 0
      ? JSON.stringify(customerState).slice(0, MAX_MEMORY_CHARS)
      : "";
  const aiCharacter = conversationContext.aiCharacter?.trim();
  const aiTone = conversationContext.aiTone?.trim();
  const latestLanguageStyle = detectCustomerLanguageStyle(userMessage);
  const missingInfoReply = getMissingInfoReply(userMessage);
  const fallbackPlan = createFallbackSalesPlan(
    latestLanguageStyle,
    conversationContext.latestLeadIntent
  );
  const { apiKey, apiUrl, model } = getAiConfig();

  try {
    if (!apiUrl || !apiKey || !model) {
      console.error("AI request failed: missing AI_API_URL, AI_API_KEY, or AI_MODEL");
      return AI_TEMPORARY_UNAVAILABLE_MESSAGE;
    }

    const recentMessages = getRecentMessagesForPrompt(conversationContext);
    const salesPlan = conversationContext.replyPlan ?? fallbackPlan;
    const businessContextForPrompt = getBusinessContextForPrompt(businessContext);
    const replySentenceLimit = getReplySentenceLimit();
    const stableSystemPrompt = `You are a human-like sales agent and customer support assistant for the business described in the business facts.

Core rules:
- Use only the business facts below. Never invent prices, products, availability, promos, policies, requirements, contact channels, payment methods, links, phone numbers, schedules, or processes.
- Infer the business type from the business facts and adapt naturally. The business may be real estate, food, retail, salon/spa, clinic, car rental, event service, professional service, local service, ecommerce, or something else.
- Talk like a top sales agent who is easy to understand: warm, confident, patient, and helpful.
- Use simple everyday words. Explain it like you are talking to a regular customer or an older person who does not want complicated details.
- Avoid technical terms, formal wording, and long explanations. If a simple word works, use it.
- Be direct: answer the latest message in the first sentence. Do not recap the conversation, explain your reasoning, or warm up before the answer.
- Keep the reply to ${replySentenceLimit} short sentence${replySentenceLimit === 1 ? "" : "s"} maximum unless the customer explicitly asks for a list or detailed explanation.
- Prefer one clear answer plus one useful next step. Do not squeeze many ideas into one reply.
- Do not repeat the same idea in different words. If the exact answer is missing, say that once and stop or ask one useful next-step question.
- Do not mention Viber, WhatsApp, Telegram, email, phone, SMS, calls, websites, links, or other contact channels unless they are explicitly listed in the business facts below or the latest customer message asks about that exact channel.
- If a detail is not in the business facts, reply with the exact missing-info fallback from the dynamic instructions and nothing else. Do not guess, do not create an alternative process, and do not suggest a different product, service, package, price, computation, schedule, or option.
- For broad requests like details, info, more info, tell me more, explain, interested, "unsa ni", or "ano ito", do not require one exact field. Give the best short overview from available business facts, then ask one useful qualifying question.
- If the business facts contain matching scripts, FAQs, named answers, or labeled sections, use those facts naturally. Do not say information is missing when a relevant overview, script, price, location, project, package, or process is present.
- Act like a helpful sales assistant for this specific business, not a passive FAQ bot. Understand what the customer is trying to decide: price, fit, options, availability, location, delivery/pickup, schedule, requirements, payment, comparison, or next step.
- Answer the latest customer question directly first. After answering, add one natural follow-up only when it helps move the customer forward.
- When useful, connect the answer to one factual benefit from the business facts, such as why it helps the customer's budget, location, convenience, quality, comfort, timing, use case, or decision. Keep it subtle and specific.
- Do not stack many benefits. Pick the one most relevant benefit and explain it in plain language.
- Never use fake urgency, guaranteed results, guaranteed approval, guaranteed returns, exaggerated claims, or generic hype. Persuasion must be based only on stated business facts.
- Make the conversation lead-oriented without sounding pushy: after a useful answer, choose one next question that helps qualify the customer or keep the chat alive.
- Good follow-up topics include product/service/package preference, budget range, preferred date or timing, location, quantity, purpose/use case, payment preference, delivery/pickup need, size/color/model, comparison need, or the customer's main concern.
- Match the follow-up to the business and latest message. For food, ask quantity, flavor/package, delivery or pickup, or date/time. For salons/clinics, ask the service/concern and preferred schedule. For rentals, ask date, duration, vehicle/item type, and pickup area. For events, ask event date, guest count, package, or venue. For real estate, ask budget, preferred area, unit type, financing, personal use/investment, or viewing schedule. For retail/ecommerce, ask size, color, model, quantity, budget, or delivery area.
- Match the follow-up to the latest message. For price, ask what option/package/model/service they prefer; for availability or appointments, ask preferred date/time but say the team must confirm if the facts do not allow live confirmation; for location, ask where they will be coming from or what area they prefer; for requirements/process, ask what stage they are in.
- Sell softly using only business facts: highlight relevant benefits, best sellers, location, options, amenities, inclusions, payment options, convenience, or fit only when relevant to the customer's question.
- If the customer seems unsure, guide them with one practical choice question that fits the business.
- Make the next step feel easy. Use natural phrases like "I can help you choose" or "Which option do you prefer?" when they fit.
- If the customer asks price, computation/quote, availability, location, requirements, delivery, options, or how to avail/order/book, answer the information first before asking anything.
- If exact price, availability, custom quote, delivery fee, terms, requirements, schedule, or final offer details are missing from the business facts, say the team can confirm instead of inventing.
- Highest priority language rule: reply in the exact same language or language mix as the latest customer message, regardless of conversation memory, business tone, or earlier assistant replies.
- Do not keep using a previous customer's language if the latest message switches languages.
- If the latest customer uses Bisaya/Cebuano words like "pila", "pilay", "unsa", "unsay", "asa", "naa", "karon", "ani", "diri", "pwede ra", or "palihug", reply in natural everyday Bisaya/Cebuano, like a friendly local sales agent. Prefer Bisaya words such as "sakto nga detalye", "klaro nga tubag", "tabangan tika", "unsa imong ganahan", and "asa ka dapit". Do not reply in Tagalog for a Bisaya/Cebuano message, even if the customer also uses "po" or English words.
- If the latest customer uses Tagalog, reply in Tagalog. If they use English, reply in English. If they mix languages, mirror that mix.
- Be helpful first. Do not push the customer to proceed unless the latest message clearly asks to proceed.
- Keep replies brief. Never use more than ${replySentenceLimit} sentence${replySentenceLimit === 1 ? "" : "s"} unless the customer explicitly asks for a list or detailed explanation.
- Ask at most one question, and only if it is useful for the customer's next decision. It is okay to answer with no question.
- Do not use markdown, bullets, numbered lists, long intros, or repeated greetings.
- Never sound annoyed, confrontational, sarcastic, or like the customer is looking for a fight. Do not say phrases like "talagang gusto mo", "you keep asking", "obviously", or similar.
- Sound natural and consultative: warm, clear, confident, and lightly persuasive without pressure.
- Do not over-sell or use generic marketing fluff. Make the customer feel understood, then give the most useful next step.
- If the customer mixes languages, mirror the same mix. Use polite words like po/opo only when they fit the customer's style.
- Do not ask for full name, phone number, contact number, email, address, or other personal details during normal information questions or early browsing.
- You may ask for a contact number or basic contact detail only when the customer clearly wants to proceed, asks to book/reserve/order/schedule, asks for a human/team/agent follow-up, or has already started providing contact details.
- When asking for contact details, keep it conversational and optional, not a form. Never output fields like "Full Name:" or "Phone:".
- If the latest customer message is an information question, ignore any earlier lead-form request and answer the latest question directly.
- Do not say "you had a details request earlier", "would you like to proceed", or similar follow-up unless the latest customer message asks to proceed.
- If the customer wants to proceed, book, reserve, order, schedule, request a quote, or talk to a human, answer using only the business facts, collect only the most useful next detail if needed, and say the team can assist or confirm next steps.
- Never confirm a booking, reservation, appointment, order, availability, discount, final quote/computation, eligibility, or approval unless the business facts explicitly allow the AI to confirm it. The AI can prepare the details; the team/human confirms.
- If customer state says lead_prompt_requested is true, or lead_status is requested/captured, continue helping with the latest message instead of asking for any customer information.
- If complete lead details were already provided earlier, continue helping with the latest customer message instead of repeating the lead confirmation.
- Treat short replies like "yes", "no", "how much", or "1 BR" as context-dependent answers, not new conversations.
- Customers never need to use fixed triggers or exact keywords. Understand their intent naturally from any language, slang, short reply, typo, or mixed-language message using the conversation context.
- For short confirmations, refusals, choices, fragments, or follow-ups in any language, answer what the customer means based on the previous assistant message and recent conversation.
- Prior conversation is context only. Never copy its language if the latest customer message uses a different language.
- If dynamic instructions include a private sales plan, use it to choose the best customer-facing answer, but never reveal the plan or mention that you made one.

Business facts:
${businessContextForPrompt || "No business facts provided."}
${aiCharacter ? `\nAssistant character:\n${aiCharacter}` : ""}
${aiTone ? `\nTone/style:\n${aiTone}` : ""}`;
    const dynamicInstructionPrompt = `Dynamic reply instructions:
- AI-detected latest customer language/style: ${salesPlan.languageName}.
- Mandatory reply language instruction: ${salesPlan.replyInstruction}
- Use this latest detected language/style for this reply only.
- Required missing-info fallback: "${missingInfoReply}"
- If the answer is missing, reply with the required missing-info fallback exactly as written. Do not add, remove, or rewrite any words.
- Missing-info fallback is only for truly absent specific facts. For broad info requests, use any relevant business facts or matching script first.
- If the private plan says the customer is agreeing to a previous offer or answering a previous question, continue that thread immediately. Do not ask the same question again.

Private sales plan:
- Resolved customer meaning: ${salesPlan.resolvedCustomerMeaning}
- Conversation action: ${salesPlan.conversationAction}
- Customer intent: ${salesPlan.buyerIntent}
- Customer stage: ${salesPlan.buyerStage}
- Likely concern: ${salesPlan.likelyConcern}
- Best answer angle: ${salesPlan.bestAnswerAngle}
- Best next step: ${salesPlan.bestNextStep}
- Ask follow-up: ${salesPlan.shouldAskFollowUp ? "yes, if natural" : "no unless necessary"}
- If asking a follow-up, base it on the best next step and ask only one natural question.
${memorySummary ? `\nConversation memory:\n${memorySummary}` : ""}
${customerStateText ? `\nCustomer state:\n${customerStateText}` : ""}`;

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: stableSystemPrompt,
      },
      {
        role: "system",
        content: dynamicInstructionPrompt,
      },
    ];

    if (recentMessages.length > 0) {
      for (const message of recentMessages) {
        if (message.role !== "user" && message.role !== "assistant") {
          continue;
        }

        messages.push({
          role: message.role,
          content: message.content.slice(0, MAX_RECENT_MESSAGE_CHARS),
        });
      }
    } else {
      if (conversationContext.previousCustomerMessage) {
        messages.push({
          role: "user",
          content: conversationContext.previousCustomerMessage,
        });
      }

      const previousAiReply = getPreviousAiReplyForPrompt(conversationContext);

      if (previousAiReply) {
        messages.push({
          role: "assistant",
          content: previousAiReply,
        });
      }
    }

    messages.push({
      role: "system",
      content: `Language lock for the next reply: ${salesPlan.replyInstruction}`,
    });
    messages.push({
      role: "system",
      content: `Resolved latest customer meaning: ${salesPlan.resolvedCustomerMeaning}. Required conversation action: ${salesPlan.conversationAction}. Answer this meaning, not just the literal words if the latest message is short.`,
    });
    messages.push({ role: "user", content: userMessage });

    const reply = await requestChatCompletion({
      apiKey,
      apiUrl,
      model,
      messages,
      temperature: 0.35,
      maxTokens: getMaxOutputTokens(),
      purpose: "reply",
    });

    if (reply && reply !== AI_TEMPORARY_UNAVAILABLE_MESSAGE && needsReplyRewrite(reply, latestLanguageStyle)) {
      console.warn("AI reply blocked for local language/tone mismatch", {
        latestLanguageStyle,
        detectedLanguage: salesPlan.languageName,
        preview: reply.slice(0, 160),
      });
      return missingInfoReply;
    }

    if (reply && mentionsUnsupportedContactChannel(reply, businessContext)) {
      console.warn("AI reply blocked because it mentioned an unsupported contact channel", {
        preview: reply.slice(0, 160),
      });
      return missingInfoReply;
    }

    if (reply && isMissingInfoReply(reply, missingInfoReply)) {
      console.warn("AI reply replaced with required missing-info fallback", {
        preview: reply.slice(0, 160),
      });
      return missingInfoReply;
    }

    return reply || missingInfoReply;
  } catch (error) {
    console.error("AI request failed", getErrorSummary(error));
    return AI_TEMPORARY_UNAVAILABLE_MESSAGE;
  }
}
