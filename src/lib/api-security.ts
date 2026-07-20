import "server-only";

import { NextRequest } from "next/server";

const CLIENT_NAME_MAX_LENGTH = 120;
const PAGE_ID_MAX_LENGTH = 100;
const TOKEN_MAX_LENGTH = 4096;

export function assertSameOrigin(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";

  if (!host) {
    throw new Error("Missing host header");
  }

  const expectedOrigin = `${protocol}://${host}`;
  const origin = request.headers.get("origin");

  if (origin) {
    if (origin !== expectedOrigin) {
      throw new Error("Cross-origin request blocked");
    }

    return;
  }

  const referer = request.headers.get("referer");

  if (!referer) {
    throw new Error("Cross-origin request blocked");
  }

  try {
    if (new URL(referer).origin !== expectedOrigin) {
      throw new Error("Cross-origin request blocked");
    }
  } catch {
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
