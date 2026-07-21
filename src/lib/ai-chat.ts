import "server-only";

const AI_TEMPORARY_UNAVAILABLE_MESSAGE =
  "Our AI assistant is temporarily unavailable. Please try again later.";
const AI_FALLBACK_REPLY =
  "Great question! Let me connect you with our specialist - one moment please.";

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

function detectReplyLanguage(userMessage: string) {
  const normalizedMessage = userMessage.toLowerCase();
  const hasTagalogCue =
    /\b(ang|mga|naman|po|opo|pwede|pede|ano|saan|kailan|magkano|meron|wala|para|ako|ikaw|siya|kami|tayo|nila|dito|iyan|yan|lang|talaga|ba|na)\b/.test(
      normalizedMessage
    );
  const hasEnglishCue =
    /\b(the|and|is|are|can|do|does|how|what|when|where|price|available|order|buy|shipping|delivery)\b/.test(
      normalizedMessage
    );

  if (hasTagalogCue && hasEnglishCue) {
    return "Taglish";
  }

  if (hasTagalogCue) {
    return "Tagalog";
  }

  return "English";
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

export async function askAi(
  userMessage: string,
  businessContext: string,
  leadFields: string[] = ["Full Name", "Phone"]
) {
  const detectedLanguage = detectReplyLanguage(userMessage);
  const leadInformationFormat = `Information\n${leadFields
    .map((field) => `${field}:`)
    .join("\n")}`;
  const systemPrompt = `You are a helpful sales and customer support assistant for a business. You are warm, confident, practical, and easy to talk to. You speak naturally and can mix English and Tagalog (Taglish).

YOUR CONVERSATION PROCESS:
1. Answer the customer's message directly.
2. If helpful, briefly connect the answer to a benefit from the business info.
3. If the customer seems interested, guide them toward the next step without sounding pushy.
4. If the customer has an objection, acknowledge it calmly and give the most relevant helpful point from the business info.
5. Mention urgency, discounts, limited slots, or special offers only when the business info clearly says they exist.
6. End with one simple next-step question, such as asking what they prefer, whether they want details, or whether they want the team to follow up.

RULES:
- ONLY use the business information provided below. Never invent prices, products, or policies.
- If the answer isn't there, say: "Great question! Let me connect you with our specialist - one moment please."
- Do not over-sell. Be helpful first, then gently guide the customer.
- Suggest add-ons, upsells, or popular items only when they are relevant and included in the business information.
- The built-in lead capture rule has priority over any business information.
- When the customer is ready to order, book, schedule, view a property, get a quote, or talk to a human, ask them to send their details exactly in this format:
${leadInformationFormat}
- Do not ask lead fields one by one. Ask for the full Information block in one message.
- If the customer already gives the needed lead fields in the Information format, say: "Thank you, I got your details. Our team will follow up shortly."
- If the customer gives partial contact details, politely ask them to resend the complete Information block.
- Detect the language used in the customer's latest message and reply in that same language.
- If the customer's latest message is in English, reply in English.
- If the customer's latest message is in Tagalog, reply in Tagalog.
- If the customer's latest message mixes English and Tagalog, reply in Taglish.
- For Taglish, use mostly English with natural Filipino words such as "po", "opo", "sige", "salamat", and "naman" when appropriate.
- If the customer says a short English phrase with "po" or "opo" such as "How much po", answer in English-heavy Taglish, not full Tagalog.
- Prioritize the customer's latest message over any earlier tone or language.
- Keep replies short: 1 to 3 sentences only.
- Do not start every reply with greetings like "Hello", "Hi there", or similar unless the customer is clearly greeting first.
- Do not repeat greetings, filler phrases, or long introductions.
- Sound natural, direct, and conversational.
- Use simple words. Avoid long explanations, markdown, bullets, and numbered lists in customer replies.
- Ask only one question at a time unless requesting the full Information block.
- Always end with a question or a clear next step - never a dead end.

BUSINESS INFORMATION:
${businessContext}`;
  const { apiKey, apiUrl, model } = getAiConfig();

  try {
    if (!apiUrl || !apiKey || !model) {
      console.error("AI request failed: missing AI_API_URL, AI_API_KEY, or AI_MODEL");
      return AI_TEMPORARY_UNAVAILABLE_MESSAGE;
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: createAiHeaders(apiKey, apiUrl),
      body: JSON.stringify({
        model,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: `${systemPrompt}\n\nLATEST CUSTOMER LANGUAGE: ${detectedLanguage}`,
          },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("AI request failed", {
        providerUrl: apiUrl,
        model,
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      return AI_TEMPORARY_UNAVAILABLE_MESSAGE;
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const reply = data.choices?.[0]?.message?.content?.trim();

    return reply || AI_FALLBACK_REPLY;
  } catch (error) {
    console.error("AI request failed", getErrorSummary(error));
    return AI_TEMPORARY_UNAVAILABLE_MESSAGE;
  }
}
