import type { NextApiRequest, NextApiResponse } from "next";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getClients, getFaqsForClient } from "@/lib/database";

export const config = {
  api: {
    bodyParser: false,
  },
};

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
    const rawBody = await readRawBody(req);
    const signature = req.headers["x-hub-signature-256"];

    if (!isValidWebhookSignature(rawBody, signature)) {
      return res.status(403).json({ error: "Invalid signature" });
    }

    const body = JSON.parse(rawBody) as WebhookBody;

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
          keywords: faq.keywords.map((keyword) => keyword.trim().toLowerCase()),
          answer: faq.answer,
          imageAttachmentId: faq.image_attachment_id,
        }));

        for (const event of entry.messaging ?? []) {
          if (event.message?.text) {
            const userId = event.sender.id;
            const userMessage = event.message.text.toLowerCase();

            const matched = clientFaqs.find((faq) =>
              faq.keywords.some((keyword: string) => userMessage.includes(keyword))
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
            } else {
              await sendTextMessage(
                userId,
                "Sorry, I didn't understand. Type 'menu' for options.",
                pageAccessToken
              );
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
  const url = `https://graph.facebook.com/v20.0/me/messages?access_token=${pageToken}`;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const url = `https://graph.facebook.com/v20.0/me/messages?access_token=${pageToken}`;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
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
