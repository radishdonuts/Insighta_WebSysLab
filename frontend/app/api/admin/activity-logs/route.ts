import { NextResponse } from "next/server";

import { jsonError, jsonServerError } from "@/app/api/admin/_utils";
import {
  getAdminActivityLogs,
  getAdminSupabase,
  parseAdminActivityLogsQuery,
  requireAdminApiAuth,
} from "@/lib/admin/activity-logs";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authResult = await requireAdminApiAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  try {
    const query = parseAdminActivityLogsQuery(new URL(request.url).searchParams);
    const response = await getAdminActivityLogs(getAdminSupabase(), query);
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && /filter|date|page|uuid/i.test(error.message)) {
      return jsonError(400, "Invalid request.", error.message);
    }

    return jsonServerError(error, "Failed to load system activity logs.");
  }
}
