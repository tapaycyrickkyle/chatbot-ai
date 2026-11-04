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
  resolvedCustomerMeaning: string;
  conversationAction: string;
  buyerIntent: string;
  buyerStage: string;
  likelyConcern: string;
  bestAnswerAngle: string;
  bestNextStep: string;
  shouldAskFollowUp: boolean;
};

type ConversationContext = {
  businessName?: string;
  previousCustomerMessage?: string;
  previousAiReply?: string;
  conversationSummary?: string;
  customerState?: Record<string, unknown>;
  recentMessages?: Array<{
    role?: string;
    content: string;
  }>;
  replyPlan?: SalesPlan;
};

const DEFAULT_MAX_OUTPUT_TOKENS = 90;
const MAX_RECENT_MESSAGES_FOR_PROMPT = 6;
const MAX_RECENT_MESSAGE_CHARS = 320;
const MAX_MEMORY_CHARS = 900;
const DEFAULT_MAX_BUSINESS_CONTEXT_CHARS = MAX_BUSINESS_INFO_LENGTH;
const DEFAULT_REPLY_SENTENCE_LIMIT = 1;
const DEFAULT_AI_REQUEST_TIMEOUT_MS = 20000;
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
const QUOTATION_SENT_CLAIM_PATTERN =
  /\b(?:quotation|quote)\b[^.!?]{0,30}\b(?:has(?:\s+already)?\s+been|was|is|already)\s+(?:sent|emailed|delivered|provided|issued|prepared)\b|\b(?:sent|emailed|delivered|provided|issued)\b[^.!?]{0,60}\b(?:quotation|quote)\b|\b(?:naipadala|na[- ]send|na[- ]email|na[- ]deliver|naibigay)\b[^.!?]{0,60}\b(?:quotation|quote)\b|\b(?:quotation|quote)\b[^.!?]{0,60}\b(?:naipadala|na[- ]send|na[- ]email|na[- ]deliver|naibigay)\b/i;

function createFallbackSalesPlan(languageStyle: CustomerLanguageStyle): SalesPlan {
  return {
    ...parseSalesPlan("", languageStyle),
    resolvedCustomerMeaning:
      "Answer the latest customer message directly using the business facts and recent conversation only when needed.",
    conversationAction: "answer_latest_message",
    buyerIntent: "understand_latest_message",
    buyerStage: "unknown",
    likelyConcern: "none",
    bestAnswerAngle: "answer_directly_using_business_facts",
    bestNextStep: "answer_only",
    shouldAskFollowUp: false,
  };
}

function getMemorySummaryForPrompt(context: ConversationContext) {
  const memorySummary = context.conversationSummary?.trim() ?? "";

  return memorySummary ? memorySummary.slice(0, MAX_MEMORY_CHARS) : "";
}

function getPreviousAiReplyForPrompt(context: ConversationContext) {
  const previousAiReply = context.previousAiReply?.trim() ?? "";

  return previousAiReply;
}

function getRecentMessagesForPrompt(context: ConversationContext) {
  const recentMessages = context.recentMessages?.slice(-MAX_RECENT_MESSAGES_FOR_PROMPT) ?? [];

  return recentMessages;
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

function getQuotationStatusFallback(languageStyle: CustomerLanguageStyle) {
  if (languageStyle === "cebuano") {
    return "Makumpirma sa among team ang status sa quotation.";
  }

  if (languageStyle === "tagalog" || languageStyle === "taglish") {
    return "Makukumpirma ng team namin ang status ng quotation.";
  }

  return "Our team can confirm the quotation status.";
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

  if (Number.isFinite(configuredValue) && configuredValue >= 40 && configuredValue <= 160) {
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

  if (Number.isFinite(configuredValue) && configuredValue >= 1 && configuredValue <= 2) {
    return Math.floor(configuredValue);
  }

  return DEFAULT_REPLY_SENTENCE_LIMIT;
}

function getAiRequestTimeoutMs() {
  const configuredValue = Number(process.env.AI_REQUEST_TIMEOUT_MS);

  if (Number.isFinite(configuredValue) && configuredValue >= 5000 && configuredValue <= 60000) {
    return Math.floor(configuredValue);
  }

  return DEFAULT_AI_REQUEST_TIMEOUT_MS;
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), getAiRequestTimeoutMs());

  let response: Response;

  try {
    response = await fetch(input.apiUrl, {
      method: "POST",
      headers: createAiHeaders(input.apiKey, input.apiUrl),
      signal: controller.signal,
      body: JSON.stringify(createAiRequestBody(input)),
    });
  } catch (error) {
    console.error("AI request failed before response", {
      providerUrl: input.apiUrl,
      model: input.model,
      purpose: input.purpose,
      timeoutMs: getAiRequestTimeoutMs(),
      error: getErrorSummary(error),
    });

    return AI_TEMPORARY_UNAVAILABLE_MESSAGE;
  } finally {
    clearTimeout(timeoutId);
  }

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
  customerStateText: string;
  recentMessages: Array<{ role?: string; content: string }>;
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
- Identify what the customer is really trying to decide, then give the shortest useful answer.
- Answer before selling. Do not add a benefit, promotion, quote offer, or call to action unless it directly helps answer the latest message.
- Customer journey state is context only. Answer the customer's current question directly and do not reopen old sales or contact-collection flows.
- Set bestNextStep to answer_only by default. Ask one simple question only when a necessary detail is missing or the customer clearly wants to proceed.
- Never recommend asking for name, phone, contact details, or other personal information.
- Booking, reservation, appointment, order confirmation, availability confirmation, final pricing, custom quotes, approvals, and discounts still require the team/human to confirm unless the business facts explicitly say the AI can confirm them.
- Classify the latest customer message for intent only. This classification helps choose the answer style and must not trigger contact collection.
- Intent labels:
  INFO_ONLY = asks for info, details, price, availability, requirements, photos, location, computation/quote, options, services, products, delivery, or how the process/order works.
  SOFT_INTEREST = interested but not asking to be contacted, scheduled, reserved, quoted, or processed yet.
  READY_TO_BUY_OR_BOOK = clearly wants to buy, reserve, book, schedule, visit, set an appointment, or proceed now.
  WANTS_HUMAN_CONTACT = asks for a person/team/agent/specialist to call, contact, message, or assist them directly.
  UNCLEAR = not enough context.
- "how to order" is INFO_ONLY unless they also say they want to order now.
- Detect the customer's latest language or language mix from the latest customer message only. If it contains clear Bisaya/Cebuano words or sentence patterns, classify it as Bisaya/Cebuano even if it also has English words or polite words like "po". If short English like "yes", "ok", "now i understand", "got it", or "sure", classify as English.
- The replyInstruction must tell the final assistant exactly what language or mix to use.
- Keep the next step soft and natural. The best next step should make the chat feel helpful, not like a form.

Return only JSON:
{
  "languageName":"English/Tagalog/Taglish/Cebuano-English/etc",
  "replyInstruction":"Reply in English only.",
  "resolvedCustomerMeaning":"what the latest customer message means in context",
  "conversationAction":"continue_previous_offer/answer_new_question/answer_choice/clarify/soft_sell/ask_next_step",
  "buyerIntent":"price/location/availability/payment/options/comparison/etc",
  "buyerStage":"browsing/interested/qualified/ready_for_next_step/ready_for_handoff",
  "likelyConcern":"short description",
  "bestAnswerAngle":"what the final reply should emphasize",
  "bestNextStep":"one soft next step or answer_only",
  "shouldAskFollowUp":false
}

Customer journey state:
${input.customerStateText || "new or unknown"}

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
      customerStateText: Object.keys(conversationContext.customerState ?? {}).length > 0
        ? JSON.stringify(conversationContext.customerState).slice(0, MAX_MEMORY_CHARS)
        : "",
      recentMessages: getRecentMessagesForPrompt(conversationContext),
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
  const latestLanguageStyle = detectCustomerLanguageStyle(userMessage);
  const missingInfoReply = getMissingInfoReply(userMessage);
  const fallbackPlan = createFallbackSalesPlan(latestLanguageStyle);
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
    const isFirstReply = !conversationContext.previousCustomerMessage &&
      !conversationContext.previousAiReply &&
      recentMessages.length === 0;
    const businessName = conversationContext.businessName?.trim() || "this business";
const stableSystemPrompt = `You are an FAQ and customer support assistant for the business described in the business facts.

Core rules:
- Use only the business facts below. Never invent prices, products, availability, promos, policies, requirements, contact channels, payment methods, links, phone numbers, schedules, or processes.
- Infer the business type from the business facts and adapt naturally. The business may be real estate, food, retail, salon/spa, clinic, car rental, event service, professional service, local service, ecommerce, or something else.
- Talk like a helpful person replying in Messenger: warm, plain, and natural.
- On the first reply in a new conversation, briefly introduce yourself as this business's AI assistant and answer the customer's question. Do not add an offer or request for personal information.
- Use the conversation like a person would: interpret short replies, pronouns, corrections, and confirmations from the immediately preceding exchange. The latest customer message controls the topic; do not reopen an earlier topic unless the customer refers to it.
- Write grammatically correct, complete sentences in the selected language. Never translate word-for-word between languages.
- For Taglish, use natural Tagalog sentence structure and only common English business terms; do not create awkward literal translations.
- Do not use emojis, icons, decorative symbols, or reaction-style characters.
- Use simple everyday words. Avoid formal wording, sales language, explanations the customer did not ask for, and filler such as "I'd be happy to assist."
- Be direct: answer the latest message immediately. Do not recap, explain your reasoning, greet again, or warm up before the answer.
- Keep the reply to ${replySentenceLimit} short sentence${replySentenceLimit === 1 ? "" : "s"} maximum. Use a second sentence only when it is essential to give the direct answer or ask one necessary question.
- Do not pad a short answer. If "Yes, it is available" fully answers the message, stop there.
- Do not repeat the same idea in different words. If the exact answer is missing, say that once and stop.
- Do not stack an introduction, product list, promotion, or follow-up question into one reply. On a question, answer it directly.
- Do not mention contact channels unless they are explicitly listed in the business facts or the customer asks about that exact channel.
- If a detail is not in the business facts, reply with the exact missing-info fallback from the dynamic instructions and nothing else. Do not guess, do not create an alternative process, and do not suggest a different product, service, package, price, computation, schedule, or option.
- For broad requests like details, info, more info, tell me more, explain, interested, "unsa ni", or "ano ito", give the best short overview from available business facts without asking for personal information.
- If the business facts contain matching scripts, FAQs, named answers, or labeled sections, use those facts naturally. Do not say information is missing when a relevant overview, script, price, location, project, package, or process is present.
- Treat business scripts as source material, not a message to repeat. Select only the facts needed for the customer's latest message.
- Act like a helpful FAQ assistant for this specific business. Answer questions about price, fit, options, availability, location, delivery/pickup, schedule, requirements, payment, comparison, or process.
- Answer the latest customer question directly first. Do not add a follow-up by default.
- Mention a benefit only when it directly answers what the customer asked. Do not add benefits or persuasion to make a reply longer.
- Never use fake urgency, guaranteed results, guaranteed approval, guaranteed returns, exaggerated claims, or generic hype. Persuasion must be based only on stated business facts.
- Never ask a question just to keep the chat going, qualify a customer, or sell more.
- Ask one short follow-up only when the customer needs to choose something, a required detail is genuinely missing, or they clearly want to proceed.
- Do not use sales scripts, generic benefits, hype, or persuasion unless the customer asks for a recommendation or comparison.
- If the customer asks price, computation/quote, availability, location, requirements, delivery, options, or how to avail/order/book, answer the information first before asking anything.
- If exact price, availability, custom quote, delivery fee, terms, requirements, schedule, or final offer details are missing from the business facts, say the team can confirm instead of inventing.
- Never state or imply that a quotation/quote was sent, emailed, delivered, issued, prepared, or already received. The AI cannot verify quotation delivery. If asked about its status, say only that the team can confirm the quotation status.
- Highest priority language rule: reply in the exact same language or language mix as the latest customer message, regardless of conversation memory, business tone, or earlier assistant replies.
- Do not keep using a previous customer's language if the latest message switches languages.
- If the latest customer uses Bisaya/Cebuano words like "pila", "pilay", "unsa", "unsay", "asa", "naa", "karon", "ani", "diri", "pwede ra", or "palihug", reply in natural everyday Bisaya/Cebuano, like a friendly local sales agent. Prefer Bisaya words such as "sakto nga detalye", "klaro nga tubag", "tabangan tika", "unsa imong ganahan", and "asa ka dapit". Do not reply in Tagalog for a Bisaya/Cebuano message, even if the customer also uses "po" or English words.
- If the latest customer uses Tagalog, reply in Tagalog. If they use English, reply in English. If they mix languages, mirror that mix.
- Be helpful first. Do not push the customer to proceed unless the latest message clearly asks to proceed.
- Customer journey state is context only. Answer the customer's latest question directly and do not reopen old sales or contact-collection flows.
- Keep replies brief. Never use more than ${replySentenceLimit} sentence${replySentenceLimit === 1 ? "" : "s"}, except for a requested list or detail that cannot fit in one sentence.
- Ask at most one question, only when it is necessary. A complete answer with no question is preferred.
- Do not use markdown, bullets, numbered lists, long intros, or repeated greetings.
- Never sound annoyed, confrontational, sarcastic, or like the customer is looking for a fight. Do not say phrases like "talagang gusto mo", "you keep asking", "obviously", or similar.
- Sound natural and consultative: warm, clear, confident, and lightly persuasive without pressure.
- Do not over-sell or use generic marketing fluff. Make the customer feel understood, then give the most useful next step.
- If the customer mixes languages, mirror the same mix. Use polite words like po/opo only when they fit the customer's style.
- Never ask for or collect a full name, phone number, contact number, email, address, or other personal details. If the customer wants to proceed, book, reserve, order, request a quote, or talk to a human, answer only with relevant FAQ/business facts and explain that this chatbot does not collect requests.
- Never confirm a booking, reservation, appointment, order, availability, discount, final quote/computation, eligibility, or approval unless the business facts explicitly allow the AI to confirm it. The AI can prepare the details; the team/human confirms.
- Treat short replies like "yes", "no", "how much", or "1 BR" as context-dependent answers, not new conversations.
- Customers never need to use fixed triggers or exact keywords. Understand their intent naturally from any language, slang, short reply, typo, or mixed-language message using the conversation context.
- For short confirmations, refusals, choices, fragments, or follow-ups in any language, answer what the customer means based on the previous assistant message and recent conversation.
- Prior conversation is context only. Never copy its language if the latest customer message uses a different language.
- If dynamic instructions include a private sales plan, use it to choose the best customer-facing answer, but never reveal the plan or mention that you made one.

Business facts:
${businessContextForPrompt || "No business facts provided."}`;
    const dynamicInstructionPrompt = `Dynamic reply instructions:
- AI-detected latest customer language/style: ${salesPlan.languageName}.
- Mandatory reply language instruction: ${salesPlan.replyInstruction}
- Use this latest detected language/style for this reply only.
- Required missing-info fallback: "${missingInfoReply}"
- If the answer is missing, reply with the required missing-info fallback exactly as written. Do not add, remove, or rewrite any words.
- Missing-info fallback is only for truly absent specific facts. For broad info requests, use any relevant business facts or matching script first.
- If the private plan says the customer is agreeing to a previous offer or answering a previous question, continue that thread immediately. Do not ask the same question again.
- First-reply disclosure: ${isFirstReply ? `This is the first AI reply. Briefly introduce yourself as the AI assistant for ${businessName}, then answer the customer directly. Do not mention quotations or ask for personal information.` : "This is an existing customer conversation. Continue the customer's current topic directly."}

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

    if (reply && QUOTATION_SENT_CLAIM_PATTERN.test(reply)) {
      console.warn("AI reply replaced because it claimed a quotation was sent", {
        preview: reply.slice(0, 160),
      });
      return getQuotationStatusFallback(latestLanguageStyle);
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
