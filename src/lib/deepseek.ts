import "server-only";

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const AI_TEMPORARY_UNAVAILABLE_MESSAGE =
  "Our AI assistant is temporarily unavailable. Please try again later.";
const AI_FALLBACK_REPLY =
  "Great question! Let me connect you with our specialist - one moment please.";

type DeepSeekChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

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

export async function askDeepSeek(userMessage: string, businessContext: string) {
  const systemPrompt = `You are a strong sales agent for a business. You are confident, empathetic, persuasive, and practical. You speak naturally and can mix English and Tagalog (Taglish).

YOUR SALES PROCESS:
1. Answer the customer's message directly.
2. Identify the underlying need or desire (not just the surface question).
3. Present the product/service as the perfect solution, using specific benefits from the business info.
4. Handle any objection with the "Feel, Felt, Found" method: "I understand how you feel. Many others felt the same way, but they found that [benefit]."
5. Create urgency (limited availability, special offer, etc.) if allowed by business info.
6. Ask for the sale directly: "Are you ready to get this?" or "Shall I place your order now?"

RULES:
- ONLY use the business information provided below. Never invent prices, products, or policies.
- If the answer isn't there, say: "Great question! Let me connect you with our specialist - one moment please."
- Be proactive: suggest add-ons, upsells, and popular items.
- Reply in the same language as the customer (English, Tagalog, or Taglish).
- Keep replies short: 1 to 3 sentences only.
- Do not start every reply with greetings like "Hello", "Hi there", or similar unless the customer is clearly greeting first.
- Do not repeat greetings, filler phrases, or long introductions.
- Sound natural, direct, and conversational.
- Always end with a question or a call to action - never a dead end.

BUSINESS INFORMATION:
${businessContext}`;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

  try {
    if (!apiKey) {
      console.error("DeepSeek request failed: missing DEEPSEEK_API_KEY");
      return AI_TEMPORARY_UNAVAILABLE_MESSAGE;
    }

    const response = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("DeepSeek request failed", {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      return AI_TEMPORARY_UNAVAILABLE_MESSAGE;
    }

    const data = (await response.json()) as DeepSeekChatCompletionResponse;
    const reply = data.choices?.[0]?.message?.content?.trim();

    return reply || AI_FALLBACK_REPLY;
  } catch (error) {
    console.error("DeepSeek request failed", getErrorSummary(error));
    return AI_TEMPORARY_UNAVAILABLE_MESSAGE;
  }
}
