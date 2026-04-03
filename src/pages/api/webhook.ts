import type { NextApiRequest, NextApiResponse } from "next";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getClients, getFaqsForClient } from "@/lib/database";
import { parseBotFlowNodeConfig } from "@/lib/bot-flow";

export const config = {
  api: {
    bodyParser: false,
  },
};

const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;
const MAX_QUICK_REPLIES = 13;
const FLOW_PAYLOAD_PREFIX = "FLOW_NODE:";

type ClientFlowNode = {
  id: string;
  keywords: string[];
  answer: string;
  imageAttachmentId: string;
};

type WebhookBody = {
  object?: string;
  entry?: Array<{
    id: string;
    messaging?: Array<{
      sender: { id: string };
      message?: {
        text?: string;
        quick_reply?: {
          payload?: string;
        };
      };
      postback?: {
        payload?: string;
      };
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
        const clientFlowNodes = (await getFaqsForClient(client.id)).map((faq) => ({
          id: faq.id,
          keywords: faq.keywords.map((keyword) => normalizeText(keyword)).filter(Boolean),
          answer: faq.answer,
          imageAttachmentId: faq.image_attachment_id ?? "",
        }));

        for (const event of entry.messaging ?? []) {
          const userId = event.sender.id;
          const flowPayload = event.message?.quick_reply?.payload ?? event.postback?.payload;

          if (flowPayload) {
            const targetNode = resolveQuickReplyTarget(client.id, flowPayload, clientFlowNodes);

            if (targetNode) {
              await sendFlowNodeMessage(userId, targetNode, client.id, pageAccessToken, clientFlowNodes);
            }

            continue;
          }

          const rawText = event.message?.text;

          if (!rawText) {
            continue;
          }

          const userMessage = normalizeText(rawText);
          const matchedNode = clientFlowNodes.find((node) =>
            node.keywords.some((keyword) => messageMatchesKeyword(userMessage, keyword))
          );

          if (!matchedNode) {
            continue;
          }

          await sendFlowNodeMessage(userId, matchedNode, client.id, pageAccessToken, clientFlowNodes);
        }
      }
    }

    return res.status(200).json({ status: "ok" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

async function sendFlowNodeMessage(
  recipientId: string,
  node: ClientFlowNode,
  clientId: string,
  pageToken: string,
  clientFlowNodes: ClientFlowNode[]
) {
  const config = parseBotFlowNodeConfig(node.answer, node.keywords[0] || "Flow Card");
  const validButtons = config.buttons.filter((button) =>
    clientFlowNodes.some((candidate) => candidate.id === button.targetNodeId)
  );

  if (node.imageAttachmentId) {
    await sendImageMessage(recipientId, node.imageAttachmentId, pageToken);
  }

  if (validButtons.length > 0) {
    if (validButtons.length <= 3) {
      await sendButtonTemplateMessage(
        recipientId,
        config.message || "Choose an option below.",
        validButtons.map((button) => ({
          title: button.label,
          payload: createFlowPayload(clientId, button.targetNodeId),
        })),
        pageToken
      );
      return;
    }

    await sendQuickRepliesMessage(
      recipientId,
      config.message || "Choose an option below.",
      validButtons.map((button) => ({
        title: button.label,
        payload: createFlowPayload(clientId, button.targetNodeId),
      })),
      pageToken
    );
    return;
  }

  if (config.message) {
    await sendTextMessage(recipientId, config.message, pageToken);
  }
}

function resolveQuickReplyTarget(
  clientId: string,
  payload: string,
  nodes: ClientFlowNode[]
) {
  const parsed = parseFlowPayload(payload);

  if (!parsed || parsed.clientId !== clientId) {
    return null;
  }

  return nodes.find((node) => node.id === parsed.nodeId) ?? null;
}

function createFlowPayload(clientId: string, nodeId: string) {
  return `${FLOW_PAYLOAD_PREFIX}${clientId}:${nodeId}`;
}

function parseFlowPayload(payload: string) {
  if (!payload.startsWith(FLOW_PAYLOAD_PREFIX)) {
    return null;
  }

  const raw = payload.slice(FLOW_PAYLOAD_PREFIX.length);
  const [clientId, nodeId] = raw.split(":");

  if (!clientId || !nodeId) {
    return null;
  }

  return { clientId, nodeId };
}

async function sendTextMessage(
  recipientId: string,
  text: string,
  pageToken: string
) {
  await sendMessengerRequest(
    {
      recipient: { id: recipientId },
      message: { text },
    },
    pageToken
  );
}

async function sendQuickRepliesMessage(
  recipientId: string,
  text: string,
  quickReplies: Array<{ title: string; payload: string }>,
  pageToken: string
) {
  const limitedQuickReplies = quickReplies.slice(0, MAX_QUICK_REPLIES);

  await sendMessengerRequest(
    {
      recipient: { id: recipientId },
      message: {
        text,
        quick_replies: limitedQuickReplies.map((quickReply) => ({
          content_type: "text",
          title: quickReply.title,
          payload: quickReply.payload,
        })),
      },
    },
    pageToken
  );
}
async function sendButtonTemplateMessage(
  recipientId: string,
  text: string,
  buttons: Array<{ title: string; payload: string }>,
  pageToken: string
) {
  await sendMessengerRequest(
    {
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text,
            buttons: buttons.slice(0, 3).map((button) => ({
              type: "postback",
              title: button.title,
              payload: button.payload,
            })),
          },
        },
      },
    },
    pageToken
  );
}


async function sendImageMessage(
  recipientId: string,
  attachmentId: string,
  pageToken: string
) {
  await sendMessengerRequest(
    {
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
    },
    pageToken
  );
}

async function sendMessengerRequest(body: unknown, pageToken: string) {
  const response = await fetch("https://graph.facebook.com/v20.0/me/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${pageToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Messenger API request failed (${response.status}): ${errorBody || response.statusText}`);
  }
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




