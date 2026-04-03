import type { NextApiRequest, NextApiResponse } from "next";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getClients, getFaqsForClient } from "@/lib/database";

export const config = {
  api: {
    bodyParser: false,
  },
};

const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

type WebhookBody = {
  object?: string;
  entry?: Array<{
    id: string;
    messaging?: Array<{
      sender: { id: string };
      message?: { text?: string };
    }>;
  }>;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }

    return res.status(403).send("Verification failed");
  }

  if (req.method === "POST") {
    let rawBody = "";

    try {
      rawBody = await readRawBody(req);
    } catch (error) {
      if (error instanceof Error && error.message === "Webhook body too large") {
        return res.status(413).json({ error: "Payload too large" });
      }

      console.error("Failed to read webhook body", error);
      return res.status(400).json({ error: "Invalid request body" });
    }

    const signature = req.headers["x-hub-signature-256"];

    if (!isValidWebhookSignature(rawBody, signature)) {
      return res.status(403).json({ error: "Invalid signature" });
    }

    let body: WebhookBody;

    try {
      body = JSON.parse(rawBody) as WebhookBody;
    } catch (error) {
      console.error("Invalid webhook JSON payload", error);
      return res.status(400).json({ error: "Invalid JSON payload" });
    }

    if (body.object === "page") {
      const clients = await getClients();

      for (const entry of body.entry ?? []) {
        const pageId = entry.id;
        const client = clients.find((row) => row.page_id === pageId);

        if (!client) {
          continue;
        }

        const pageAccessToken = client.page_access_token;
        const clientFaqs = (await getFaqsForClient(client.id)).map((faq) => ({
          keywords: faq.keywords
            .map((keyword) => normalizeText(keyword))
            .filter(Boolean),
          answer: faq.answer,
          imageAttachmentId: faq.image_attachment_id,
        }));

        for (const event of entry.messaging ?? []) {
          if (event.message?.text) {
            const userId = event.sender.id;
            const userMessage = normalizeText(event.message.text);

            const matched = clientFaqs.find((faq) =>
              faq.keywords.some((keyword: string) =>
                messageMatchesKeyword(userMessage, keyword)
              )
            );

            if (matched) {
              if (matched.imageAttachmentId) {
                await sendImageMessage(
                  userId,
                  matched.imageAttachmentId,
                  pageAccessToken
                );
              } else {
                await sendTextMessage(
                  userId,
                  matched.answer,
                  pageAccessToken
                );
              }
            }
          }
        }
      }
    }

    return res.status(200).json({ status: "ok" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

async function sendTextMessage(
  recipientId: string,
  text: string,
  pageToken: string
) {
  await fetch("https://graph.facebook.com/v20.0/me/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${pageToken}`,
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  });
}

async function sendImageMessage(
  recipientId: string,
  attachmentId: string,
  pageToken: string
) {
  await fetch("https://graph.facebook.com/v20.0/me/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${pageToken}`,
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "media",
            elements: [{ media_type: "image", attachment_id: attachmentId }],
          },
        },
      },
    }),
  });
}

async function readRawBody(req: NextApiRequest) {
  const contentLengthHeader = req.headers["content-length"];
  const contentLength =
    typeof contentLengthHeader === "string"
      ? Number.parseInt(contentLengthHeader, 10)
      : Number.NaN;

  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BODY_BYTES) {
    throw new Error("Webhook body too large");
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const normalizedChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += normalizedChunk.length;

    if (totalBytes > MAX_WEBHOOK_BODY_BYTES) {
      throw new Error("Webhook body too large");
    }

    chunks.push(normalizedChunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function isValidWebhookSignature(
  rawBody: string,
  signatureHeader: string | string[] | undefined
) {
  const secret = process.env.FACEBOOK_APP_SECRET;

  if (!secret || typeof signatureHeader !== "string") {
    return false;
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const actual = signatureHeader.replace(/^sha256=/, "");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function messageMatchesKeyword(message: string, keyword: string) {
  if (!message || !keyword) {
    return false;
  }

  return message === keyword;
}
