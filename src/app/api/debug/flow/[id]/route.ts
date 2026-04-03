import { NextRequest, NextResponse } from "next/server";
import { getFaqsForClient } from "@/lib/database";
import { parseBotFlowNodeConfig } from "@/lib/bot-flow";
import { sanitizeIdentifier } from "@/lib/api-security";
import { ADMIN_ACCESS_TOKEN_COOKIE, verifyAdminAccessToken } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const faqs = await getFaqsForClient(clientId);
    const parsedNodes = faqs.map((faq) => {
      const config = parseBotFlowNodeConfig(faq.answer, faq.keywords[0] || "Flow Card");

      return {
        id: faq.id,
        keywords: faq.keywords,
        answer: faq.answer,
        captureNextReply: config.captureNextReply,
        replyTargetNodeId: config.replyTargetNodeId,
        buttons: config.buttons.map((button) => ({
          id: button.id,
          label: button.label,
          targetNodeId: button.targetNodeId,
        })),
        images: config.images,
        message: config.message,
      };
    });

    const { data: replySessions, error: replySessionError } = await supabaseAdmin
      .from("bot_flow_reply_sessions")
      .select("client_id, page_id, recipient_id, waiting_node_id, next_node_id, updated_at")
      .eq("client_id", clientId)
      .order("updated_at", { ascending: false });

    if (replySessionError) {
      throw new Error(replySessionError.message || "Failed to load reply sessions");
    }

    return NextResponse.json({
      clientId,
      nodes: parsedNodes,
      replySessions: replySessions ?? [],
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
