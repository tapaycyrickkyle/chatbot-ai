import "server-only";

export type GoogleSheetsLeadInput = {
  fullName: string;
  phone: string;
  pageId: string;
  pageName: string;
  recipientId: string;
  message: string;
  capturedAt: string;
  fields: Record<string, string>;
};

export type GoogleSheetsLeadFlowInput = {
  pageName: string;
  pageId: string;
  recipientId: string;
  message: string;
  leadFields: string[];
  startLeadFlow: boolean;
};

export type GoogleSheetsLeadFlowResponse = {
  status?: "idle" | "asking" | "complete";
  reply?: string;
};

function getSheetsWebhookUrl() {
  return process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim() || "";
}

export async function sendLeadToGoogleSheet(
  input: GoogleSheetsLeadInput,
  options: { webhookUrl?: string } = {}
) {
  const webhookUrl = options.webhookUrl?.trim() || getSheetsWebhookUrl();

  if (!webhookUrl) {
    console.info("Google Sheets lead capture skipped: no webhook URL configured");
    return false;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Google Sheets lead capture failed: ${response.status} ${response.statusText} ${body}`.trim()
    );
  }

  return true;
}

export async function advanceGoogleSheetLeadFlow(
  input: GoogleSheetsLeadFlowInput,
  options: { webhookUrl?: string } = {}
) {
  const webhookUrl = options.webhookUrl?.trim() || getSheetsWebhookUrl();

  if (!webhookUrl) {
    return null;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "lead_flow",
      ...input,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Google Sheets lead flow failed: ${response.status} ${response.statusText} ${body}`.trim()
    );
  }

  return (await response.json().catch(() => null)) as GoogleSheetsLeadFlowResponse | null;
}
