import "server-only";

import { NextRequest } from "next/server";

const CLIENT_NAME_MAX_LENGTH = 120;
const PAGE_ID_MAX_LENGTH = 100;
const TOKEN_MAX_LENGTH = 4096;
const ANSWER_MAX_LENGTH = 5000;
const IMAGE_ID_MAX_LENGTH = 120;
const KEYWORD_MAX_LENGTH = 80;
const MAX_KEYWORDS = 20;

export function assertSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin) {
    return;
  }

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";

  if (!host) {
    throw new Error("Missing host header");
  }

  const expectedOrigin = `${protocol}://${host}`;

  if (origin !== expectedOrigin) {
    throw new Error("Cross-origin request blocked");
  }
}

export function validateClientPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid request body");
  }

  const { client_name, page_id, page_access_token } = payload as Record<string, unknown>;

  if (
    typeof client_name !== "string" ||
    typeof page_id !== "string" ||
    typeof page_access_token !== "string"
  ) {
    throw new Error("Missing or invalid fields");
  }

  const sanitized = {
    client_name: client_name.trim(),
    page_id: page_id.trim(),
    page_access_token: page_access_token.trim(),
  };

  if (
    !sanitized.client_name ||
    !sanitized.page_id ||
    !sanitized.page_access_token
  ) {
    throw new Error("Missing required fields");
  }

  if (sanitized.client_name.length > CLIENT_NAME_MAX_LENGTH) {
    throw new Error("Client name is too long");
  }

  if (sanitized.page_id.length > PAGE_ID_MAX_LENGTH) {
    throw new Error("Page ID is too long");
  }

  if (sanitized.page_access_token.length > TOKEN_MAX_LENGTH) {
    throw new Error("Page access token is too long");
  }

  return sanitized;
}

export function validateFaqPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid request body");
  }

  const { keywords, answer, image_attachment_id } = payload as Record<string, unknown>;

  if (!Array.isArray(keywords) || typeof answer !== "string") {
    throw new Error("Missing or invalid fields");
  }

  const normalizedKeywords = keywords
    .filter((keyword): keyword is string => typeof keyword === "string")
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  if (normalizedKeywords.length === 0) {
    throw new Error("At least one keyword is required");
  }

  if (normalizedKeywords.length > MAX_KEYWORDS) {
    throw new Error("Too many keywords");
  }

  if (normalizedKeywords.some((keyword) => keyword.length > KEYWORD_MAX_LENGTH)) {
    throw new Error("Keyword is too long");
  }

  const normalizedAnswer = answer.trim();

  if (!normalizedAnswer) {
    throw new Error("Answer is required");
  }

  if (normalizedAnswer.length > ANSWER_MAX_LENGTH) {
    throw new Error("Answer is too long");
  }

  let normalizedImageId = "";

  if (image_attachment_id !== undefined && image_attachment_id !== null) {
    if (typeof image_attachment_id !== "string") {
      throw new Error("Invalid image attachment ID");
    }

    normalizedImageId = image_attachment_id.trim();

    if (normalizedImageId.length > IMAGE_ID_MAX_LENGTH) {
      throw new Error("Image attachment ID is too long");
    }
  }

  return {
    keywords: normalizedKeywords,
    answer: normalizedAnswer,
    image_attachment_id: normalizedImageId,
  };
}

export function validateFaqUpdatePayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid request body");
  }

  const { faqId, ...rest } = payload as Record<string, unknown>;

  const normalizedFaqId =
    typeof faqId === "string" || typeof faqId === "number"
      ? String(faqId).trim()
      : "";

  if (!normalizedFaqId) {
    throw new Error("Invalid FAQ ID");
  }

  return {
    faqId: sanitizeIdentifier(normalizedFaqId, "FAQ ID"),
    ...validateFaqPayload(rest),
  };
}

export function sanitizeIdentifier(value: string, fieldName: string) {
  const sanitized = value.trim();

  if (!sanitized) {
    throw new Error(`${fieldName} is required`);
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
    throw new Error(`Invalid ${fieldName}`);
  }

  return sanitized;
}

