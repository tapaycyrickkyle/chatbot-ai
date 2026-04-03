import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ACCESS_TOKEN_COOKIE, verifyAdminAccessToken } from "@/lib/admin-auth";
import { assertSameOrigin, sanitizeIdentifier } from "@/lib/api-security";
import { getClientById } from "@/lib/database";

export async function POST(req: NextRequest) {
  const session = await verifyAdminAccessToken(
    req.cookies.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value
  );

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    assertSameOrigin(req);

    const formData = await req.formData();
    const clientId = sanitizeIdentifier(String(formData.get("clientId") ?? ""), "client ID");
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Image file is required" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image uploads are supported" }, { status: 400 });
    }

    const client = await getClientById(clientId);

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const facebookFormData = new FormData();
    facebookFormData.append(
      "message",
      JSON.stringify({
        attachment: {
          type: "image",
          payload: {
            is_reusable: true,
          },
        },
      })
    );
    facebookFormData.append("filedata", file, file.name);

    const response = await fetch(
      `https://graph.facebook.com/v20.0/me/message_attachments?access_token=${encodeURIComponent(
        client.page_access_token
      )}`,
      {
        method: "POST",
        body: facebookFormData,
      }
    );

    const result = (await response.json().catch(() => null)) as
      | {
          attachment_id?: string;
          error?: { message?: string };
        }
      | null;

    if (!response.ok || !result?.attachment_id) {
      return NextResponse.json(
        {
          error:
            result?.error?.message ??
            "Facebook image upload failed",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      attachmentId: result.attachment_id,
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
