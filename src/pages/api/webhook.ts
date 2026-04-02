import type { NextApiRequest, NextApiResponse } from "next";
import { getSheet } from "@/lib/sheets";

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
    const body = req.body;

    if (body.object === "page") {
      for (const entry of body.entry) {
        const pageId = entry.id;
        const clientsSheet = await getSheet("clients");
        const rows = await clientsSheet.getRows();
        const clientRow = rows.find((row) => row.get("page_id") === pageId);

        if (!clientRow) {
          continue;
        }

        const pageAccessToken = clientRow.get("page_access_token");
        const clientId = clientRow.get("id");

        const faqsSheet = await getSheet("faqs");
        const faqRows = await faqsSheet.getRows();
        const clientFaqs = faqRows
          .filter((row) => row.get("client_id") === clientId)
          .map((row) => ({
            keywords: row
              .get("keywords")
              .split(",")
              .map((keyword: string) => keyword.trim().toLowerCase()),
            answer: row.get("answer"),
            imageAttachmentId: row.get("image_attachment_id"),
          }));

        for (const event of entry.messaging) {
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
