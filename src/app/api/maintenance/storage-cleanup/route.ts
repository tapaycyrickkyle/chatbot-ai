import { cleanupOldStorageData } from "@/lib/storage-maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const maintenanceSecret = getMaintenanceSecret();

  if (!maintenanceSecret || !isAuthorizedMaintenanceRequest(request, maintenanceSecret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await cleanupOldStorageData();

  return Response.json({
    success: true,
    ...result,
  });
}

export async function GET(request: Request) {
  return POST(request);
}

function isAuthorizedMaintenanceRequest(request: Request, maintenanceSecret: string) {
  const providedSecret =
    request.headers.get("x-ai-worker-secret") ||
    getBearerToken(request.headers.get("authorization") ?? "");

  return providedSecret === maintenanceSecret;
}

function getMaintenanceSecret() {
  return process.env.AI_WORKER_SECRET?.trim() || process.env.CRON_SECRET?.trim() || "";
}

function getBearerToken(value: string) {
  return value.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}
