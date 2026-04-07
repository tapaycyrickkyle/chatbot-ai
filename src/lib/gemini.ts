import "server-only";

import { GoogleGenAI } from "@google/genai";

const FALLBACK_REPLY = "I don't have that information.";
const AI_UNAVAILABLE_REPLY = "Our AI assistant is temporarily unavailable. Please try again later.";

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  return new GoogleGenAI({ apiKey });
}

export async function askGemini(userMessage: string, businessContext: string) {
  const prompt = `You are a customer support assistant for a business.
Use ONLY the following business information to answer the customer's question.
If the answer is not in the information, say "I don't have that information."

Business Information:
${businessContext}

Customer Question: ${userMessage}

Answer (concise, friendly, helpful):`;

  try {
    const response = await getGeminiClient().models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    });

    return response.text?.trim() || FALLBACK_REPLY;
  } catch (error) {
    console.error("Gemini request failed", error);
    return AI_UNAVAILABLE_REPLY;
  }
}
