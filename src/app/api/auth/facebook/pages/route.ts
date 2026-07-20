import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ACCESS_TOKEN_COOKIE, verifyAdminAccessToken } from "@/lib/admin-auth";
import { getFacebookAccountPages } from "@/lib/facebook-pages";

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
    const pages = await getFacebookAccountPages(userToken);
    const safePages = pages.map((page) => ({
      id: page.id,
      name: page.name,
      picture_url: buildPagePictureUrl(page.id),
    }));

    return NextResponse.json({ pages: safePages });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
