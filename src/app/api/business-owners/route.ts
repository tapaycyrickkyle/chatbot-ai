import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ACCESS_TOKEN_COOKIE, verifyAdminAccessToken } from "@/lib/admin-auth";
import { assertSameOrigin, sanitizeIdentifier } from "@/lib/api-security";
import {
  deleteBusinessUser,
  getBusinessUsers,
  getClientById,
  getClients,
  upsertBusinessUser,
} from "@/lib/database";
import { supabaseAdmin } from "@/lib/supabase";

function unauthorizedResponse() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validatePassword(value: unknown) {
  const password = typeof value === "string" ? value : "";

  if (password && password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }

  return password;
}

async function requireAdmin(req: NextRequest) {
  return verifyAdminAccessToken(req.cookies.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value);
}

export async function GET(req: NextRequest) {
  const session = await requireAdmin(req);

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const [owners, clients] = await Promise.all([getBusinessUsers(), getClients()]);
    const clientsById = new Map(clients.map((client) => [client.id, client]));

    return NextResponse.json({
      owners: owners.map((owner) => {
        const client = clientsById.get(owner.client_id);

        return {
          id: owner.id,
          email: owner.email,
          role: owner.role,
          client_id: owner.client_id,
          created_at: owner.created_at,
          client_name: client?.client_name ?? "",
          page_id: client?.page_id ?? "",
        };
      }),
      clients: clients.map((client) => ({
        id: client.id,
        client_name: client.client_name,
        page_id: client.page_id,
      })),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin(req);

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    assertSameOrigin(req);

    const body = (await req.json().catch(() => null)) as
      | { email?: unknown; password?: unknown; client_id?: unknown }
      | null;
    const email = normalizeEmail(body?.email);
    const password = validatePassword(body?.password);
    const clientId =
      typeof body?.client_id === "string"
        ? sanitizeIdentifier(body.client_id, "client ID")
        : "";

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid owner email is required" }, { status: 400 });
    }

    if (!clientId) {
      return NextResponse.json({ error: "Page assignment is required" }, { status: 400 });
    }

    const client = await getClientById(clientId);

    if (!client) {
      return NextResponse.json({ error: "Assigned page was not found" }, { status: 404 });
    }

    if (password) {
      const { error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (error && !/already registered|already exists|already been registered/i.test(error.message)) {
        throw new Error(error.message || "Failed to create owner auth user");
      }
    }

    const owner = await upsertBusinessUser({ clientId, email });

    return NextResponse.json({
      success: true,
      owner: {
        id: owner.id,
        email: owner.email,
        role: owner.role,
        client_id: owner.client_id,
        created_at: owner.created_at,
        client_name: client.client_name,
        page_id: client.page_id,
      },
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status =
      message === "Cross-origin request blocked" || message === "Missing host header"
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
  const session = await requireAdmin(req);

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    assertSameOrigin(req);

    const body = (await req.json().catch(() => null)) as { owner_id?: unknown } | null;
    const ownerId =
      typeof body?.owner_id === "string"
        ? sanitizeIdentifier(body.owner_id, "owner ID")
        : "";

    if (!ownerId) {
      return NextResponse.json({ error: "Owner ID is required" }, { status: 400 });
    }

    await deleteBusinessUser(ownerId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status =
      message === "Cross-origin request blocked" || message === "Missing host header"
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
