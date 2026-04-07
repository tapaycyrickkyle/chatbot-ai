import { NextRequest, NextResponse } from "next/server";
import {
  addClient,
  deleteClientById,
  deleteClientByPageId,
  deleteFaqsForClient,
  getClientById,
  getClients,
} from "@/lib/database";
import { assertSameOrigin, sanitizeIdentifier, validateClientPayload } from "@/lib/api-security";
import { ADMIN_ACCESS_TOKEN_COOKIE, verifyAdminAccessToken } from "@/lib/admin-auth";

function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function subscribePageToWebhook(pageId: string, pageAccessToken: string) {
  const subscribeResponse = await fetch(
    `https://graph.facebook.com/v20.0/${pageId}/subscribed_apps`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        access_token: pageAccessToken,
        subscribed_fields: ["messages", "messaging_postbacks"],
      }),
    }
  );

  if (!subscribeResponse.ok) {
    const subscribeData = (await subscribeResponse.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;

    throw new Error(
      subscribeData?.error?.message ?? "Webhook subscription failed for this page"
    );
  }
}

async function configureMessengerProfile(clientName: string, pageAccessToken: string) {
  const profileResponse = await fetch(
    `https://graph.facebook.com/v20.0/me/messenger_profile?access_token=${encodeURIComponent(
      pageAccessToken
    )}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        get_started: {
          payload: "GET_STARTED",
        },
        greeting: [
          {
            locale: "default",
            text: `Welcome to ${clientName}. Tap Get Started to open the chat.`,
          },
        ],
      }),
    }
  );

  if (!profileResponse.ok) {
    const profileData = (await profileResponse.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;

    throw new Error(
      profileData?.error?.message ?? "Messenger profile setup failed for this page"
    );
  }
}

async function finalizeClientConnection(clientName: string, pageId: string, pageAccessToken: string) {
  await subscribePageToWebhook(pageId, pageAccessToken);
  await configureMessengerProfile(clientName, pageAccessToken);
}


export async function GET(req: NextRequest) {
  const session = await verifyAdminAccessToken(
    req.cookies.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value
  );

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const clients = await getClients();
    const safeClients = clients.map((client) => ({
      id: client.id,
      client_name: client.client_name,
      page_id: client.page_id,
      created_at: client.created_at,
      picture_url: client.picture_url,
      bot_type: client.bot_type,
    }));

    return NextResponse.json(safeClients);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await verifyAdminAccessToken(
    req.cookies.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value
  );

  if (!session) {
    return unauthorizedResponse();
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

      const pagesResponse = await fetch("https://graph.facebook.com/v20.0/me/accounts", {
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });
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

      try {
        await finalizeClientConnection(
          validatedPayload.client_name,
          validatedPayload.page_id,
          matchedPage.access_token
        );
      } catch (error) {
        await deleteClientByPageId(validatedPayload.page_id);

        return NextResponse.json(
          {
            error: error instanceof Error ? error.message : "Facebook page setup failed",
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

    try {
      await finalizeClientConnection(client_name, page_id, page_access_token);
    } catch (error) {
      await deleteClientByPageId(page_id);

      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Facebook page setup failed",
        },
        { status: 400 }
      );
    }

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

export async function DELETE(req: NextRequest) {
  const session = await verifyAdminAccessToken(
    req.cookies.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value
  );

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    assertSameOrigin(req);

    const body = (await req.json().catch(() => null)) as { clientId?: unknown } | null;
    const clientId =
      typeof body?.clientId === "string"
        ? sanitizeIdentifier(body.clientId, "client ID")
        : "";

    if (!clientId) {
      return NextResponse.json({ error: "Missing client ID" }, { status: 400 });
    }

    const client = await getClientById(clientId);

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    try {
      const unsubscribeResponse = await fetch(
        `https://graph.facebook.com/v20.0/${client.page_id}/subscribed_apps`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            access_token: client.page_access_token,
          }),
        }
      );

      if (!unsubscribeResponse.ok) {
        const unsubscribeData = await unsubscribeResponse.json().catch(() => null);
        console.error("Facebook unsubscribe failed", unsubscribeData);
      }
    } catch (error) {
      console.error("Facebook unsubscribe request failed", error);
    }

    await deleteFaqsForClient(clientId);
    await deleteClientById(clientId);

    return NextResponse.json({ success: true, clientId });
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





