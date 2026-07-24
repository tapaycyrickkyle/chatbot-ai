import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ACCESS_TOKEN_COOKIE, verifyAdminAccessToken } from "@/lib/admin-auth";
import { assertSameOrigin, sanitizeIdentifier } from "@/lib/api-security";
import {
  MAX_AI_CHARACTER_LENGTH,
  MAX_AI_TONE_LENGTH,
  MAX_BUSINESS_INFO_LENGTH,
} from "@/lib/business-info";
import { getClientById, updateClientSettings } from "@/lib/database";

const MAX_LEAD_CAPTURE_MESSAGES = 2;
const MAX_LEAD_CAPTURE_MESSAGE_LENGTH = 1200;
const MAX_LEAD_CAPTURE_MESSAGES_TOTAL_LENGTH =
  MAX_LEAD_CAPTURE_MESSAGES * MAX_LEAD_CAPTURE_MESSAGE_LENGTH +
  (MAX_LEAD_CAPTURE_MESSAGES - 1) * 2;
const MAX_WELCOME_MESSAGES = 5;
const MAX_WELCOME_MESSAGE_LENGTH = 1200;
const MAX_WELCOME_MESSAGES_TOTAL_LENGTH =
  MAX_WELCOME_MESSAGES * MAX_WELCOME_MESSAGE_LENGTH + (MAX_WELCOME_MESSAGES - 1) * 2;
const MAX_WELCOME_LINK_URL_LENGTH = 2000;
const MAX_WELCOME_ATTACHMENT_IDS_LENGTH = 2000;
const MAX_AUTO_REPLY_IGNORE_PATTERNS = 10;
const MAX_AUTO_REPLY_IGNORE_PATTERN_LENGTH = 500;
const MAX_AUTO_REPLY_IGNORE_PATTERNS_TOTAL_LENGTH =
  MAX_AUTO_REPLY_IGNORE_PATTERNS * MAX_AUTO_REPLY_IGNORE_PATTERN_LENGTH +
  (MAX_AUTO_REPLY_IGNORE_PATTERNS - 1);
const MANUAL_AI_PAUSE_MINUTE_OPTIONS = [5, 15, 30, 60, 120, 240, 480, 1440];
const MAX_WELCOME_ATTACHMENTS = 11;
const MESSENGER_ATTACHMENT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const MESSENGER_WEBHOOK_FIELDS = ["messages", "messaging_postbacks", "message_echoes"];

function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function subscribePageToMessengerWebhook(pageId: string, pageAccessToken: string) {
  const response = await fetch(
    `https://graph.facebook.com/v20.0/${encodeURIComponent(pageId)}/subscribed_apps`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        access_token: pageAccessToken,
        subscribed_fields: MESSENGER_WEBHOOK_FIELDS,
      }),
    }
  );

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;

    throw new Error(data?.error?.message || "Failed to repair Messenger webhook subscription");
  }
}

function validateClientSettingsPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid request body");
  }

  const {
    bot_type,
    business_info,
    ai_enabled,
    ai_character,
    ai_tone,
    lead_capture_messages,
    welcome_sequence_enabled,
    welcome_message,
    welcome_link_url,
    welcome_image_urls,
    manual_ai_pause_minutes,
    auto_reply_ignore_pattern,
  } = payload as Record<string, unknown>;
  const updates: Partial<{
    bot_type: "ai";
    business_info: string;
    ai_enabled: boolean;
    ai_character: string;
    ai_tone: string;
    lead_capture_messages: string;
    welcome_sequence_enabled: boolean;
    welcome_message: string;
    welcome_link_url: string;
    welcome_image_urls: string;
    manual_ai_pause_minutes: number;
    auto_reply_ignore_pattern: string;
  }> = {};

  if (bot_type !== undefined) {
    if (bot_type !== "ai") {
      throw new Error("Invalid bot_type");
    }

    updates.bot_type = "ai";
  }

  if (business_info !== undefined) {
    if (typeof business_info !== "string") {
      throw new Error("Invalid business_info");
    }

    if (business_info.length > MAX_BUSINESS_INFO_LENGTH) {
      throw new Error("Business information is too long");
    }

    updates.business_info = business_info.trim();
  }

  if (ai_enabled !== undefined) {
    if (typeof ai_enabled !== "boolean") {
      throw new Error("Invalid ai_enabled");
    }

    updates.ai_enabled = ai_enabled;
  }

  if (ai_character !== undefined) {
    if (typeof ai_character !== "string") {
      throw new Error("Invalid AI character");
    }

    if (ai_character.length > MAX_AI_CHARACTER_LENGTH) {
      throw new Error("AI character is too long");
    }

    updates.ai_character = ai_character.trim();
  }

  if (ai_tone !== undefined) {
    if (typeof ai_tone !== "string") {
      throw new Error("Invalid AI tone");
    }

    if (ai_tone.length > MAX_AI_TONE_LENGTH) {
      throw new Error("AI tone is too long");
    }

    updates.ai_tone = ai_tone.trim();
  }

  if (lead_capture_messages !== undefined) {
    if (typeof lead_capture_messages !== "string") {
      throw new Error("Invalid lead capture messages");
    }

    if (lead_capture_messages.length > MAX_LEAD_CAPTURE_MESSAGES_TOTAL_LENGTH) {
      throw new Error("Lead capture messages are too long");
    }

    const leadCaptureMessages = lead_capture_messages
      .split(/\n\s*\n/)
      .map((message) => message.trim())
      .filter(Boolean);

    if (leadCaptureMessages.length > MAX_LEAD_CAPTURE_MESSAGES) {
      throw new Error(`Use ${MAX_LEAD_CAPTURE_MESSAGES} lead capture messages or fewer`);
    }

    for (const message of leadCaptureMessages) {
      if (message.length > MAX_LEAD_CAPTURE_MESSAGE_LENGTH) {
        throw new Error("Each lead capture message must be 1200 characters or fewer");
      }
    }

    updates.lead_capture_messages = leadCaptureMessages.join("\n\n");
  }

  if (welcome_sequence_enabled !== undefined) {
    if (typeof welcome_sequence_enabled !== "boolean") {
      throw new Error("Invalid welcome sequence status");
    }

    updates.welcome_sequence_enabled = welcome_sequence_enabled;
  }

  if (welcome_message !== undefined) {
    if (typeof welcome_message !== "string") {
      throw new Error("Invalid welcome message");
    }

    if (welcome_message.length > MAX_WELCOME_MESSAGES_TOTAL_LENGTH) {
      throw new Error("Welcome messages are too long");
    }

    const welcomeMessages = welcome_message
      .split(/\n\s*\n/)
      .map((message) => message.trim())
      .filter(Boolean);

    if (welcomeMessages.length > MAX_WELCOME_MESSAGES) {
      throw new Error(`Use ${MAX_WELCOME_MESSAGES} welcome messages or fewer`);
    }

    for (const message of welcomeMessages) {
      if (message.length > MAX_WELCOME_MESSAGE_LENGTH) {
        throw new Error("Each welcome message must be 1200 characters or fewer");
      }
    }

    updates.welcome_message = welcomeMessages.join("\n\n");
  }

  if (welcome_link_url !== undefined) {
    if (typeof welcome_link_url !== "string") {
      throw new Error("Invalid welcome link URL");
    }

    const trimmedUrl = welcome_link_url.trim();

    if (trimmedUrl.length > MAX_WELCOME_LINK_URL_LENGTH) {
      throw new Error("Welcome link URL is too long");
    }

    if (trimmedUrl) {
      let parsedUrl: URL;

      try {
        parsedUrl = new URL(trimmedUrl);
      } catch {
        throw new Error("Invalid welcome link URL");
      }

      if (parsedUrl.protocol !== "https:") {
        throw new Error("Welcome link URL must use HTTPS");
      }
    }

    updates.welcome_link_url = trimmedUrl;
  }

  if (welcome_image_urls !== undefined) {
    if (typeof welcome_image_urls !== "string") {
      throw new Error("Invalid welcome image attachment IDs");
    }

    if (welcome_image_urls.length > MAX_WELCOME_ATTACHMENT_IDS_LENGTH) {
      throw new Error("Welcome image attachments are too long");
    }

    const attachmentIds = welcome_image_urls
      .split(/\r?\n/)
      .map((attachmentId) => attachmentId.trim())
      .filter(Boolean);

    if (attachmentIds.length > MAX_WELCOME_ATTACHMENTS) {
      throw new Error(`Use ${MAX_WELCOME_ATTACHMENTS} welcome image attachments or fewer`);
    }

    for (const attachmentId of attachmentIds) {
      if (!MESSENGER_ATTACHMENT_ID_PATTERN.test(attachmentId)) {
        throw new Error("Invalid welcome image attachment ID");
      }
    }

    updates.welcome_image_urls = attachmentIds.join("\n");
  }

  if (manual_ai_pause_minutes !== undefined) {
    const minutes = Number(manual_ai_pause_minutes);

    if (
      !Number.isInteger(minutes) ||
      !MANUAL_AI_PAUSE_MINUTE_OPTIONS.includes(minutes)
    ) {
      throw new Error(
        `Manual AI pause duration must be one of: ${MANUAL_AI_PAUSE_MINUTE_OPTIONS.join(", ")} minutes`
      );
    }

    updates.manual_ai_pause_minutes = minutes;
  }

  if (auto_reply_ignore_pattern !== undefined) {
    if (typeof auto_reply_ignore_pattern !== "string") {
      throw new Error("Invalid auto-reply ignore pattern");
    }

    if (auto_reply_ignore_pattern.length > MAX_AUTO_REPLY_IGNORE_PATTERNS_TOTAL_LENGTH) {
      throw new Error("Auto-reply ignore patterns are too long");
    }

    const autoReplyIgnorePatterns = auto_reply_ignore_pattern
      .split(/\r?\n/)
      .map((pattern) => pattern.trim())
      .filter(Boolean);

    if (autoReplyIgnorePatterns.length > MAX_AUTO_REPLY_IGNORE_PATTERNS) {
      throw new Error(`Use ${MAX_AUTO_REPLY_IGNORE_PATTERNS} auto-reply ignore messages or fewer`);
    }

    for (const pattern of autoReplyIgnorePatterns) {
      if (pattern.length > MAX_AUTO_REPLY_IGNORE_PATTERN_LENGTH) {
        throw new Error("Each auto-reply ignore message must be 500 characters or fewer");
      }
    }

    updates.auto_reply_ignore_pattern = autoReplyIgnorePatterns.join("\n");
  }

  return updates;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await verifyAdminAccessToken(
    req.cookies.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value
  );

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await context.params;
    const clientId = sanitizeIdentifier(id, "client ID");
    const client = await getClientById(clientId);

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: client.id,
      client_name: client.client_name,
      page_id: client.page_id,
      bot_type: client.bot_type,
      business_info: client.business_info,
      ai_enabled: client.ai_enabled,
      ai_character: client.ai_character,
      ai_tone: client.ai_tone,
      lead_capture_messages: client.lead_capture_messages,
      welcome_sequence_enabled: client.welcome_sequence_enabled,
      welcome_message: client.welcome_message,
      welcome_link_url: client.welcome_link_url,
      welcome_image_urls: client.welcome_image_urls,
      manual_ai_pause_minutes: client.manual_ai_pause_minutes,
      auto_reply_ignore_pattern: client.auto_reply_ignore_pattern,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message === "Internal server error" ? 500 : 400;

    return NextResponse.json(
      { error: status === 500 ? "Internal server error" : message },
      { status }
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await verifyAdminAccessToken(
    req.cookies.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value
  );

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    assertSameOrigin(req);

    const { id } = await context.params;
    const clientId = sanitizeIdentifier(id, "client ID");
    const client = await getClientById(clientId);

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const updates = validateClientSettingsPayload(await req.json());

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No settings provided" }, { status: 400 });
    }

    await updateClientSettings(clientId, updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status =
      message === "Cross-origin request blocked" ||
      message === "Missing host header"
        ? 403
        : message === "Internal server error"
          ? 500
          : 400;

    return NextResponse.json(
      { error: status === 500 ? "Internal server error" : message },
      { status }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await verifyAdminAccessToken(
    req.cookies.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value
  );

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    assertSameOrigin(req);

    const { id } = await context.params;
    const clientId = sanitizeIdentifier(id, "client ID");
    const client = await getClientById(clientId);

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
    const action = typeof body?.action === "string" ? body.action : "";

    if (action !== "repair_messenger_webhook") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    await subscribePageToMessengerWebhook(client.page_id, client.page_access_token);

    return NextResponse.json({
      success: true,
      subscribed_fields: MESSENGER_WEBHOOK_FIELDS,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status =
      message === "Cross-origin request blocked" ||
      message === "Missing host header"
        ? 403
        : message === "Internal server error"
          ? 500
          : 400;

    return NextResponse.json(
      { error: status === 500 ? "Internal server error" : message },
      { status }
    );
  }
}
