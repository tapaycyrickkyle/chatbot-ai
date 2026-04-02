import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ACCESS_TOKEN_COOKIE, verifyAdminAccessToken } from "@/lib/admin-auth";

function buildPagePictureUrl(pageId: string) {
  return `https://graph.facebook.com/${encodeURIComponent(pageId)}/picture?type=large`;
}

export async function GET(req: NextRequest) {
  const session = await verifyAdminAccessToken(
    req.cookies.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value
  );

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userToken = req.cookies.get("fb_user_token")?.value;

  if (!userToken) {
    return NextResponse.json({ error: "Missing Facebook session" }, { status: 400 });
  }

  try {
    const pagesResponse = await fetch("https://graph.facebook.com/v20.0/me/accounts", {
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
    });
    const pagesData = (await pagesResponse.json()) as {
      data?: Array<{ id?: string; name?: string }>;
      error?: unknown;
    };

    if (!pagesResponse.ok) {
      console.error("Facebook pages fetch failed", pagesData);
      return NextResponse.json({ error: "Failed to load pages" }, { status: 400 });
    }

    const safePages = Array.isArray(pagesData.data)
      ? pagesData.data.map((page) => ({
          id: page.id ?? "",
          name: page.name ?? "",
          picture_url: page.id ? buildPagePictureUrl(page.id) : "",
        }))
      : [];

    return NextResponse.json({ pages: safePages });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
