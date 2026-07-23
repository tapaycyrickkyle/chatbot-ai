import "server-only";

import {
  detectCustomerLanguageStyle,
  getMissingInfoReply,
  type CustomerLanguageStyle,
} from "@/lib/language-style";

const AI_TEMPORARY_UNAVAILABLE_MESSAGE =
  "Our AI assistant is temporarily unavailable. Please try again later.";

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

const DEFAULT_MAX_OUTPUT_TOKENS = 120;
const MAX_RECENT_MESSAGES_FOR_PROMPT = 6;
const MAX_RECENT_MESSAGE_CHARS = 320;
const MAX_MEMORY_CHARS = 900;
const DEFAULT_MAX_BUSINESS_CONTEXT_CHARS = 6000;
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
    bestNextStep: "answer_only",
    shouldAskFollowUp: false,
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
      return "Write the next assistant reply in Bisaya/Cebuano only. Do not use Tagalog or English except for unavoidable product names.";
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

  if (Number.isFinite(configuredValue) && configuredValue >= 1000 && configuredValue <= 20000) {
    return Math.floor(configuredValue);
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
          "You are the private sales strategist for a real estate Messenger agent. Think carefully, but return only compact JSON. Do not write the customer-facing reply.",
      },
      {
        role: "user",
        content: `Understand the latest customer turn in context, then plan the best real estate sales response.

Rules:
- Use only the business facts. Do not invent prices, availability, promos, financing terms, requirements, or schedules.
- First resolve what the customer really means using recent conversation and the previous assistant reply.
- Understand confirmations, refusals, choices, fragments, follow-ups, and corrections in any language. Do not require fixed keywords or triggers from the customer.
- Short replies such as "yes", "opo", "oo", "sige", "sure", "go", "tell me", "okay", "hm", "why", "how", "that one", "1BR", or any local-language equivalent must be interpreted from context, not treated as a new standalone topic.
- If the previous assistant offered to explain something and the customer confirms in any language, the action is continue_previous_offer and the answer should provide the explanation promised.
- If the previous assistant asked a choice question and the customer answers with one option, continue with that option.
- If the customer refuses or hesitates in any language, answer gently and offer a lower-pressure next step.
- If the customer asks a new question, answer the new question directly.
- Identify what the buyer is really trying to decide.
- Choose the answer angle most likely to build trust and move the buyer closer to inquiry, viewing, reservation, or sample computation.
- Do not recommend asking for name/phone unless the latest message clearly wants viewing, reservation, meeting, callback, or follow-up.
- Classify whether the latest customer message should trigger lead capture. Do not trigger lead capture for ordinary details, price, availability, computation, requirements, or how-to-order questions.
- Lead intent labels:
  INFO_ONLY = asks for info, details, price, availability, requirements, photos, location, computation, monthly amortization, or how the process/order works.
  SOFT_INTEREST = interested but not asking to be contacted, scheduled, reserved, quoted, or processed yet.
  READY_TO_BUY_OR_BOOK = clearly wants to buy, reserve, book, schedule, visit, set an appointment, or proceed now.
  WANTS_HUMAN_CONTACT = asks for a person/team/agent/specialist to call, contact, message, or assist them directly.
  PROVIDED_LEAD_DETAILS = provides name and phone/contact details.
  UNCLEAR = not enough context.
- "how to order" is INFO_ONLY unless they also say they want to order now.
- Detect the customer's latest language or language mix from the latest customer message only. If short English like "yes", "ok", "now i understand", "got it", or "sure", classify as English.
- The replyInstruction must tell the final assistant exactly what language or mix to use.
- Keep the next step soft and natural.

Return only JSON:
{
  "languageName":"English/Tagalog/Taglish/Cebuano-English/etc",
  "replyInstruction":"Reply in English only.",
  "leadCaptureIntent":"INFO_ONLY/SOFT_INTEREST/READY_TO_BUY_OR_BOOK/WANTS_HUMAN_CONTACT/PROVIDED_LEAD_DETAILS/UNCLEAR",
  "resolvedCustomerMeaning":"what the latest customer message means in context",
  "conversationAction":"continue_previous_offer/answer_new_question/answer_choice/clarify/soft_sell/ask_next_step",
  "buyerIntent":"price/location/availability/payment/viewing/comparison/etc",
  "buyerStage":"browsing/interested/qualified/ready_to_schedule/ready_to_reserve",
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
  _leadFields: string[] = ["Full Name", "Phone"],
  conversationContext: ConversationContext = {}
) {
  void _leadFields;
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
    const stableSystemPrompt = `You are a human-like real estate sales agent and customer support assistant.

Core rules:
- Use only the business facts below. Never invent prices, products, availability, promos, policies, requirements, contact channels, payment methods, links, phone numbers, schedules, or processes.
- Be direct: answer the latest message in the first sentence. Do not recap the conversation, explain your reasoning, or warm up before the answer.
- Keep the reply to ${replySentenceLimit} short sentence${replySentenceLimit === 1 ? "" : "s"} maximum unless the customer explicitly asks for a list or detailed explanation.
- Do not repeat the same idea in different words. If the exact answer is missing, say that once and stop or ask one useful next-step question.
- Do not mention Viber, WhatsApp, Telegram, email, phone, SMS, calls, websites, links, or other contact channels unless they are explicitly listed in the business facts below or the latest customer message asks about that exact channel.
- If a detail is not in the business facts, use the missing-info reply provided in the dynamic instructions. Do not guess and do not create an alternative process.
- Act like a helpful real estate agent, not a passive FAQ bot. Understand what the customer is trying to decide: price, unit fit, location, availability, parking, payment, viewing, reservation, or next step.
- Answer the latest customer question directly first. After answering, add one natural follow-up only when it helps move the buyer forward.
- Sell softly using only business facts: highlight location, unit options, amenities, payment options, or buyer fit only when relevant to the customer's question.
- If the customer seems unsure, guide them with one practical choice question, such as preferred unit type, budget range, payment method, purpose, or viewing schedule.
- If the customer asks price, computation, availability, location, parking, requirements, or how to avail, answer the information first before asking anything.
- If exact price, availability, computation, parking terms, requirements, or schedule details are missing from the business facts, say the team can confirm instead of inventing.
- Highest priority language rule: reply in the exact same language or language mix as the latest customer message, regardless of conversation memory, business tone, or earlier assistant replies.
- Do not keep using a previous customer's language if the latest message switches languages.
- If the latest customer uses Bisaya/Cebuano words like "pila", "unsa", "asa", "naa", "karon", "ani", "diri", or "palihug", reply in Bisaya/Cebuano. Do not reply in Tagalog for a Bisaya/Cebuano message.
- If the latest customer uses Tagalog, reply in Tagalog. If they use English, reply in English. If they mix languages, mirror that mix.
- Be helpful first. Do not push the customer to proceed unless the latest message clearly asks to proceed.
- Keep replies brief. Never use more than ${replySentenceLimit} sentence${replySentenceLimit === 1 ? "" : "s"} unless the customer explicitly asks for a list or detailed explanation.
- Ask at most one question, and only if it is useful for the customer's next decision. It is okay to answer with no question.
- Do not use markdown, bullets, numbered lists, long intros, or repeated greetings.
- Never sound annoyed, confrontational, sarcastic, or like the customer is looking for a fight. Do not say phrases like "talagang gusto mo", "you keep asking", "obviously", or similar.
- Sound natural and consultative: warm, clear, confident, and lightly persuasive without pressure.
- Do not over-sell or use generic marketing fluff. Make the customer feel understood, then give the most useful next step.
- If the customer mixes languages, mirror the same mix. Use polite words like po/opo only when they fit the customer's style.
- Do not ask for lead details just because the customer asks for details, info, price, availability, requirements, photos, sample computation, or how to order. Answer those information questions first.
- Never output a lead detail form, and never write fields like "Full Name:" or "Phone:". The system handles lead collection separately before you are called.
- If the latest customer message is an information question, ignore any earlier lead-form request and answer the latest question directly.
- Do not say "you had a details request earlier", "would you like to proceed", or similar follow-up unless the latest customer message asks to proceed.
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
- If the answer is missing, reply exactly in the customer's language: "${missingInfoReply}"
- If the private plan says the customer is agreeing to a previous offer or answering a previous question, continue that thread immediately. Do not ask the same question again.

Private sales plan:
- Resolved customer meaning: ${salesPlan.resolvedCustomerMeaning}
- Conversation action: ${salesPlan.conversationAction}
- Buyer intent: ${salesPlan.buyerIntent}
- Buyer stage: ${salesPlan.buyerStage}
- Likely concern: ${salesPlan.likelyConcern}
- Best answer angle: ${salesPlan.bestAnswerAngle}
- Best next step: ${salesPlan.bestNextStep}
- Ask follow-up: ${salesPlan.shouldAskFollowUp ? "yes, if natural" : "no unless necessary"}
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

    return reply || missingInfoReply;
  } catch (error) {
    console.error("AI request failed", getErrorSummary(error));
    return AI_TEMPORARY_UNAVAILABLE_MESSAGE;
  }
}
