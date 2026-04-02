import { NextRequest, NextResponse } from "next/server";
import { addClient, deleteClientByPageId, getClients } from "@/lib/sheets";
import { assertSameOrigin, validateClientPayload } from "@/lib/api-security";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const session = verifyAdminSessionToken(
    req.cookies.get(ADMIN_SESSION_COOKIE)?.value
  );

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const clients = await getClients();
    const safeClients = clients.map((client) => ({
      id: client.id,
      client_name: client.client_name,
      page_id: client.page_id,
      created_at: client.created_at,
    }));

    return NextResponse.json(safeClients);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = verifyAdminSessionToken(
    req.cookies.get(ADMIN_SESSION_COOKIE)?.value
  );

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    assertSameOrigin(req);

    const body = await req.json();
    const existingClients = await getClients();

    if (
      typeof body?.facebook_page_id === "string" &&
      typeof body?.client_name === "string" &&
      !body?.page_access_token
    ) {
      const userToken = req.cookies.get("fb_user_token")?.value;

      if (!userToken) {
        return NextResponse.json({ error: "Missing Facebook session" }, { status: 400 });
      }

      const pagesResponse = await fetch(
        `https://graph.facebook.com/v20.0/me/accounts?access_token=${userToken}`
      );
      const pagesData = await pagesResponse.json();
      const matchedPage = Array.isArray(pagesData.data)
        ? pagesData.data.find(
            (page: { id?: string; access_token?: string }) =>
              page.id === body.facebook_page_id
          )
        : null;

      if (!matchedPage?.access_token) {
        return NextResponse.json({ error: "Unable to resolve page token" }, { status: 400 });
      }

      const validatedPayload = validateClientPayload({
        client_name: body.client_name,
        page_id: body.facebook_page_id,
        page_access_token: matchedPage.access_token,
      });

      if (existingClients.some((client) => client.page_id === validatedPayload.page_id)) {
        return NextResponse.json({ error: "Client already connected" }, { status: 409 });
      }

      await addClient(validatedPayload);

      const subscribeResponse = await fetch(
        `https://graph.facebook.com/v20.0/${validatedPayload.page_id}/subscribed_apps`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            access_token: matchedPage.access_token,
            subscribed_fields: ["messages", "messaging_postbacks"],
          }),
        }
      );

      if (!subscribeResponse.ok) {
        const subscribeData = (await subscribeResponse.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;

        await deleteClientByPageId(validatedPayload.page_id);

        return NextResponse.json(
          {
            error:
              subscribeData?.error?.message ??
              "Webhook subscription failed for this page",
          },
          { status: 400 }
        );
      }

      return NextResponse.json({ success: true });
    }

    const { client_name, page_id, page_access_token } = validateClientPayload(body);

    if (existingClients.some((client) => client.page_id === page_id)) {
      return NextResponse.json({ error: "Client already connected" }, { status: 409 });
    }

    await addClient({ client_name, page_id, page_access_token });
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
