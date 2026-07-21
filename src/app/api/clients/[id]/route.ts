import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ACCESS_TOKEN_COOKIE, verifyAdminAccessToken } from "@/lib/admin-auth";
import { assertSameOrigin, sanitizeIdentifier } from "@/lib/api-security";
import {
  MAX_AI_CHARACTER_LENGTH,
  MAX_AI_TONE_LENGTH,
  MAX_BUSINESS_INFO_LENGTH,
} from "@/lib/business-info";
import { getClientById, updateClientSettings } from "@/lib/database";

const MAX_LEAD_CAPTURE_FIELDS_LENGTH = 2000;
const MAX_GOOGLE_SHEETS_TAB_NAME_LENGTH = 100;
const MAX_WELCOME_MESSAGE_LENGTH = 1200;
const MAX_WELCOME_URL_LENGTH = 2000;
const MAX_WELCOME_IMAGE_URLS_LENGTH = 6000;
const MAX_WELCOME_IMAGE_URLS = 5;
const INVALID_GOOGLE_SHEETS_TAB_NAME_PATTERN = /[:\\/?*\[\]]/;

function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    google_sheets_webhook_url,
    google_sheets_tab_name,
    lead_capture_fields,
    welcome_sequence_enabled,
    welcome_message,
    welcome_link_url,
    welcome_image_urls,
  } = payload as Record<string, unknown>;
  const updates: Partial<{
    bot_type: "ai";
    business_info: string;
    ai_enabled: boolean;
    ai_character: string;
    ai_tone: string;
    google_sheets_webhook_url: string;
    google_sheets_tab_name: string;
    lead_capture_fields: string;
    welcome_sequence_enabled: boolean;
    welcome_message: string;
    welcome_link_url: string;
    welcome_image_urls: string;
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

  if (google_sheets_webhook_url !== undefined) {
    if (typeof google_sheets_webhook_url !== "string") {
      throw new Error("Invalid Google Sheets webhook URL");
    }

    const trimmedUrl = google_sheets_webhook_url.trim();

    if (trimmedUrl) {
      let parsedUrl: URL;

      try {
        parsedUrl = new URL(trimmedUrl);
      } catch {
        throw new Error("Invalid Google Sheets webhook URL");
      }

      if (parsedUrl.protocol !== "https:") {
        throw new Error("Google Sheets webhook URL must use HTTPS");
      }
    }

    updates.google_sheets_webhook_url = trimmedUrl;
  }

  if (google_sheets_tab_name !== undefined) {
    if (typeof google_sheets_tab_name !== "string") {
      throw new Error("Invalid Google Sheets tab name");
    }

    const trimmedTabName = google_sheets_tab_name.trim() || "Sheet1";

    if (trimmedTabName.length > MAX_GOOGLE_SHEETS_TAB_NAME_LENGTH) {
      throw new Error("Google Sheets tab name is too long");
    }

    if (INVALID_GOOGLE_SHEETS_TAB_NAME_PATTERN.test(trimmedTabName)) {
      throw new Error("Google Sheets tab name cannot contain: : \\ / ? * [ ]");
    }

    updates.google_sheets_tab_name = trimmedTabName;
  }

  if (lead_capture_fields !== undefined) {
    if (typeof lead_capture_fields !== "string") {
      throw new Error("Invalid lead capture fields");
    }

    if (lead_capture_fields.length > MAX_LEAD_CAPTURE_FIELDS_LENGTH) {
      throw new Error("Lead capture fields are too long");
    }

    updates.lead_capture_fields = lead_capture_fields.trim();
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

    if (welcome_message.length > MAX_WELCOME_MESSAGE_LENGTH) {
      throw new Error("Welcome message is too long");
    }

    updates.welcome_message = welcome_message.trim();
  }

  if (welcome_link_url !== undefined) {
    if (typeof welcome_link_url !== "string") {
      throw new Error("Invalid welcome link URL");
    }

    const trimmedUrl = welcome_link_url.trim();

    if (trimmedUrl.length > MAX_WELCOME_URL_LENGTH) {
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
      throw new Error("Invalid welcome image URLs");
    }

    if (welcome_image_urls.length > MAX_WELCOME_IMAGE_URLS_LENGTH) {
      throw new Error("Welcome image URLs are too long");
    }

    const imageUrls = welcome_image_urls
      .split(/\r?\n/)
      .map((url) => url.trim())
      .filter(Boolean);

    if (imageUrls.length > MAX_WELCOME_IMAGE_URLS) {
      throw new Error(`Use ${MAX_WELCOME_IMAGE_URLS} welcome image URLs or fewer`);
    }

    for (const imageUrl of imageUrls) {
      if (imageUrl.length > MAX_WELCOME_URL_LENGTH) {
        throw new Error("Welcome image URL is too long");
      }

      let parsedUrl: URL;

      try {
        parsedUrl = new URL(imageUrl);
      } catch {
        throw new Error("Invalid welcome image URL");
      }

      if (parsedUrl.protocol !== "https:") {
        throw new Error("Welcome image URLs must use HTTPS");
      }
    }

    updates.welcome_image_urls = imageUrls.join("\n");
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
      google_sheets_webhook_url: client.google_sheets_webhook_url,
      google_sheets_tab_name: client.google_sheets_tab_name,
      lead_capture_fields: client.lead_capture_fields,
      welcome_sequence_enabled: client.welcome_sequence_enabled,
      welcome_message: client.welcome_message,
      welcome_link_url: client.welcome_link_url,
      welcome_image_urls: client.welcome_image_urls,
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
