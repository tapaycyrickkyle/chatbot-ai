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
};

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type LanguageDetection = {
  languageName: string;
  replyInstruction: string;
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
};

const DEFAULT_MAX_OUTPUT_TOKENS = 160;
const MAX_RECENT_MESSAGES_FOR_PROMPT = 6;
const MAX_RECENT_MESSAGE_CHARS = 320;
const MAX_MEMORY_CHARS = 900;
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

function getMemorySummaryForPrompt(context: ConversationContext) {
  const memorySummary = context.conversationSummary?.trim() ?? "";

  if (!memorySummary || shouldSuppressLeadContext(context.latestLeadIntent) && isLeadCollectionText(memorySummary)) {
    return "";
  }

  return memorySummary.slice(0, MAX_MEMORY_CHARS);
}

function getPreviousAiReplyForPrompt(context: ConversationContext) {
  const previousAiReply = context.previousAiReply?.trim() ?? "";

  if (!previousAiReply || shouldSuppressLeadContext(context.latestLeadIntent) && isLeadCollectionText(previousAiReply)) {
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

function getStrictLanguageInstruction(languageStyle: CustomerLanguageStyle) {
  switch (languageStyle) {
    case "english":
      return "The customer's latest message is English. Reply in English only. Remove all Tagalog, Taglish, Bisaya/Cebuano, and words like po/opo.";
    case "cebuano":
      return "The customer's latest message is Bisaya/Cebuano. Reply in natural Bisaya/Cebuano only. Do not use Tagalog phrases.";
    case "tagalog":
      return "The customer's latest message is Tagalog. Reply in natural Tagalog only. Do not use Bisaya/Cebuano phrases.";
    case "taglish":
      return "The customer's latest message is Taglish. Reply in natural Taglish only. Do not switch to full Bisaya/Cebuano.";
    default:
      return "Reply in English only unless the latest customer message contains clear Tagalog or Bisaya/Cebuano words.";
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

function parseLanguageDetection(value: string, fallbackStyle: CustomerLanguageStyle): LanguageDetection {
  try {
    const parsed = JSON.parse(cleanJsonText(value)) as {
      languageName?: unknown;
      replyInstruction?: unknown;
    };
    const languageName =
      typeof parsed.languageName === "string" && parsed.languageName.trim()
        ? parsed.languageName.trim().slice(0, 80)
        : fallbackStyle;
    const replyInstruction =
      typeof parsed.replyInstruction === "string" && parsed.replyInstruction.trim()
        ? parsed.replyInstruction.trim().slice(0, 220)
        : getReplyLanguageInstruction(fallbackStyle);

    return { languageName, replyInstruction };
  } catch {
    return {
      languageName: fallbackStyle,
      replyInstruction: getReplyLanguageInstruction(fallbackStyle),
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

async function requestChatCompletion(input: {
  apiKey: string;
  apiUrl: string;
  model: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
}) {
  const response = await fetch(input.apiUrl, {
    method: "POST",
    headers: createAiHeaders(input.apiKey, input.apiUrl),
    body: JSON.stringify({
      model: input.model,
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      messages: input.messages,
    }),
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

  return data.choices?.[0]?.message?.content?.trim() || "";
}

async function detectLatestCustomerLanguage(input: {
  apiKey: string;
  apiUrl: string;
  model: string;
  userMessage: string;
  fallbackStyle: CustomerLanguageStyle;
}) {
  const fallbackDetection = {
    languageName: input.fallbackStyle,
    replyInstruction: getReplyLanguageInstruction(input.fallbackStyle),
  };

  const response = await requestChatCompletion({
    apiKey: input.apiKey,
    apiUrl: input.apiUrl,
    model: input.model,
    temperature: 0,
    maxTokens: 90,
    messages: [
      {
        role: "system",
        content:
          "You detect the language of the latest customer message for a Messenger chatbot. Return only compact JSON. Do not answer the customer.",
      },
      {
        role: "user",
        content: `Identify the language or language mix of this latest customer message only.

Rules:
- Ignore previous conversation. Use only this message.
- If the message is short English like "yes", "ok", "now i understand", "got it", or "sure", classify it as English.
- If it is mixed, name the mix, for example "Taglish" or "Cebuano-English".
- The replyInstruction must tell the assistant exactly what language or mix to use.

Return only JSON:
{"languageName":"English","replyInstruction":"Reply in English only."}

Latest customer message:
${input.userMessage}`,
      },
    ],
  });

  if (!response || response === AI_TEMPORARY_UNAVAILABLE_MESSAGE) {
    return fallbackDetection;
  }

  return parseLanguageDetection(response, input.fallbackStyle);
}

async function validateReplyLanguage(input: {
  apiKey: string;
  apiUrl: string;
  model: string;
  userMessage: string;
  reply: string;
  languageDetection: LanguageDetection;
}) {
  const response = await requestChatCompletion({
    apiKey: input.apiKey,
    apiUrl: input.apiUrl,
    model: input.model,
    temperature: 0,
    maxTokens: 30,
    messages: [
      {
        role: "system",
        content:
          "You validate whether an assistant reply follows the required customer language. Return only JSON.",
      },
      {
        role: "user",
        content: `Required language:
${input.languageDetection.languageName}

Required instruction:
${input.languageDetection.replyInstruction}

Latest customer message:
${input.userMessage}

Assistant reply:
${input.reply}

Return only JSON:
{"valid":true}
or
{"valid":false}`,
      },
    ],
  });

  if (!response || response === AI_TEMPORARY_UNAVAILABLE_MESSAGE) {
    return true;
  }

  try {
    const parsed = JSON.parse(cleanJsonText(response)) as { valid?: unknown };

    return parsed.valid === true;
  } catch {
    return true;
  }
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

export async function classifyLeadCaptureIntent(
  userMessage: string,
  conversationContext: Pick<ConversationContext, "previousAiReply" | "conversationSummary" | "recentMessages"> = {}
): Promise<LeadCaptureIntent> {
  const { apiKey, apiUrl, model } = getAiConfig();

  if (!apiUrl || !apiKey || !model) {
    return "UNCLEAR";
  }

  const recentMessages =
    conversationContext.recentMessages
      ?.slice(-4)
      .map((message) => `${message.role === "assistant" ? "Assistant" : "Customer"}: ${message.content}`)
      .join("\n")
      .slice(0, 900) ?? "";

  const prompt = `Classify the latest customer message for lead capture.

Return only JSON like {"intent":"INFO_ONLY"}.

Labels:
- INFO_ONLY: asks for info, details, price, availability, requirements, photos, location, computation, or how the process/order works.
- SOFT_INTEREST: interested but not asking to be contacted, scheduled, reserved, quoted, or processed yet.
- READY_TO_BUY_OR_BOOK: clearly wants to buy, place an order now, reserve, book, schedule, visit, set an appointment, or proceed.
- WANTS_HUMAN_CONTACT: asks for a person/team/agent/specialist to call, contact, message, or assist them directly.
- PROVIDED_LEAD_DETAILS: provides name and phone/contact details.
- UNCLEAR: not enough context.

Important:
- Understand any language or mixed language.
- "how to order" is INFO_ONLY unless they also say they want to order now.
- "details", "info", "how much", "sample computation", and "available?" are INFO_ONLY.
- Do not classify as READY_TO_BUY_OR_BOOK just because the message mentions order, quote, computation, price, details, or information.

Recent conversation:
${recentMessages || conversationContext.conversationSummary || "None"}

Previous assistant reply:
${getPreviousAiReplyForPrompt(conversationContext) || "None"}

Latest customer message:
${userMessage}`;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: createAiHeaders(apiKey, apiUrl),
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 40,
        messages: [
          {
            role: "system",
            content: "You classify lead-capture intent. Return only valid compact JSON.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      console.warn("Lead intent classification failed", {
        providerUrl: apiUrl,
        model,
        status: response.status,
        statusText: response.statusText,
      });
      return "UNCLEAR";
    }

    const data = (await response.json()) as ChatCompletionResponse;
    return parseLeadIntent(data.choices?.[0]?.message?.content?.trim() || "");
  } catch (error) {
    console.warn("Lead intent classification failed", getErrorSummary(error));
    return "UNCLEAR";
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
  const { apiKey, apiUrl, model } = getAiConfig();

  try {
    if (!apiUrl || !apiKey || !model) {
      console.error("AI request failed: missing AI_API_URL, AI_API_KEY, or AI_MODEL");
      return AI_TEMPORARY_UNAVAILABLE_MESSAGE;
    }

    const languageDetection = await detectLatestCustomerLanguage({
      apiKey,
      apiUrl,
      model,
      userMessage,
      fallbackStyle: latestLanguageStyle,
    });
    const systemPrompt = `You are a human-like sales and customer support assistant.

Core rules:
- Use only the business facts below. Never invent prices, products, availability, promos, policies, requirements, contact channels, payment methods, links, phone numbers, schedules, or processes.
- Do not mention Viber, WhatsApp, Telegram, email, phone, SMS, calls, websites, links, or other contact channels unless they are explicitly listed in the business facts below or the latest customer message asks about that exact channel.
- If a detail is not in the business facts, use the missing-info reply. Do not guess and do not create an alternative process.
- Highest priority language rule: reply in the exact same language or language mix as the latest customer message, regardless of conversation memory, business tone, or earlier assistant replies.
- AI-detected latest customer language/style: ${languageDetection.languageName}.
- Mandatory reply language instruction: ${languageDetection.replyInstruction}
- Use this latest detected language/style for this reply only.
- Do not keep using a previous customer's language if the latest message switches languages.
- If the latest customer uses Bisaya/Cebuano words like "pila", "unsa", "asa", "naa", "karon", "ani", "diri", or "palihug", reply in Bisaya/Cebuano. Do not reply in Tagalog for a Bisaya/Cebuano message.
- If the latest customer uses Tagalog, reply in Tagalog. If they use English, reply in English. If they mix languages, mirror that mix.
- If the answer is missing, reply exactly in the customer's language: "${missingInfoReply}"
- Be helpful first. Do not push the customer to proceed unless the latest message clearly asks to proceed.
- Keep replies to 1-2 short sentences by default, 3 only when needed.
- Ask only one question.
- Do not use markdown, bullets, numbered lists, long intros, or repeated greetings.
- Never sound annoyed, confrontational, sarcastic, or like the customer is looking for a fight. Do not say phrases like "talagang gusto mo", "you keep asking", "obviously", or similar.
- If the customer mixes languages, mirror the same mix. Use polite words like po/opo only when they fit the customer's style.
- Do not ask for lead details just because the customer asks for details, info, price, availability, requirements, photos, sample computation, or how to order. Answer those information questions first.
- Never output a lead detail form, and never write fields like "Full Name:" or "Phone:". The system handles lead collection separately before you are called.
- If the latest customer message is an information question, ignore any earlier lead-form request and answer the latest question directly.
- Do not say "you had a details request earlier", "would you like to proceed", or similar follow-up unless the latest customer message asks to proceed.
- If complete lead details were already provided earlier, continue helping with the latest customer message instead of repeating the lead confirmation.
- Treat short replies like "yes", "no", "how much", or "1 BR" as context-dependent answers, not new conversations.
- Prior conversation is context only. Never copy its language if the latest customer message uses a different language.

Business facts:
${businessContext || "No business facts provided."}
${aiCharacter ? `\nAssistant character:\n${aiCharacter}` : ""}
${aiTone ? `\nTone/style:\n${aiTone}` : ""}
${memorySummary ? `\nConversation memory:\n${memorySummary}` : ""}
${customerStateText ? `\nCustomer state:\n${customerStateText}` : ""}`;

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: systemPrompt,
      },
    ];

    const recentMessages = getRecentMessagesForPrompt(conversationContext);

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
      content: `Language lock for the next reply: ${languageDetection.replyInstruction}`,
    });
    messages.push({ role: "user", content: userMessage });

    let reply = await requestChatCompletion({
      apiKey,
      apiUrl,
      model,
      messages,
      temperature: 0.35,
      maxTokens: getMaxOutputTokens(),
    });

    if (
      reply &&
      reply !== AI_TEMPORARY_UNAVAILABLE_MESSAGE &&
      (needsReplyRewrite(reply, latestLanguageStyle) ||
        !(await validateReplyLanguage({
          apiKey,
          apiUrl,
          model,
          userMessage,
          reply,
          languageDetection,
        })))
    ) {
      console.warn("AI reply rewritten for language/tone mismatch", {
        latestLanguageStyle,
        detectedLanguage: languageDetection.languageName,
        preview: reply.slice(0, 160),
      });

      reply = await requestChatCompletion({
        apiKey,
        apiUrl,
        model,
        messages: [
          ...messages,
          {
            role: "assistant",
            content: reply,
          },
          {
            role: "system",
            content: `${languageDetection.replyInstruction} ${getStrictLanguageInstruction(latestLanguageStyle)} Also sound friendly and direct. Do not say "talagang gusto mo" or imply the customer is arguing, repeating themselves, or being difficult.`,
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
        temperature: 0.2,
        maxTokens: getMaxOutputTokens(),
      });
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
